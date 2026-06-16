
-- ========== ENUMS ==========
CREATE TYPE public.activity_type AS ENUM (
  'ticket_created','ticket_assigned','ticket_reassigned','first_response',
  'client_replied','technician_replied','status_changed','ticket_resolved',
  'ticket_closed','rating_received','user_login'
);

-- ========== ACTIVITY EVENTS ==========
CREATE TABLE public.activity_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ticket_id UUID REFERENCES public.tickets(id) ON DELETE CASCADE,
  type public.activity_type NOT NULL,
  from_value TEXT,
  to_value TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_activity_events_created ON public.activity_events(created_at DESC);
CREATE INDEX idx_activity_events_ticket ON public.activity_events(ticket_id);
CREATE INDEX idx_activity_events_actor ON public.activity_events(actor_id);
CREATE INDEX idx_activity_events_type ON public.activity_events(type);
GRANT SELECT, INSERT ON public.activity_events TO authenticated;
GRANT ALL ON public.activity_events TO service_role;
ALTER TABLE public.activity_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "activity_admin_all" ON public.activity_events FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));
CREATE POLICY "activity_tech_own" ON public.activity_events FOR SELECT TO authenticated
  USING (
    ticket_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.tickets t WHERE t.id = activity_events.ticket_id AND t.technician_id = auth.uid()
    )
  );
CREATE POLICY "activity_insert_system" ON public.activity_events FOR INSERT TO authenticated
  WITH CHECK (true);

-- ========== TICKET METRICS ==========
CREATE TABLE public.ticket_metrics (
  ticket_id UUID PRIMARY KEY REFERENCES public.tickets(id) ON DELETE CASCADE,
  first_tech_open_at TIMESTAMPTZ,
  first_response_at TIMESTAMPTZ,
  last_client_message_at TIMESTAMPTZ,
  last_tech_message_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  messages_count INT NOT NULL DEFAULT 0,
  time_to_first_response_seconds INT,
  total_resolution_seconds INT,
  client_wait_seconds INT NOT NULL DEFAULT 0,
  tech_wait_seconds INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.ticket_metrics TO authenticated;
GRANT ALL ON public.ticket_metrics TO service_role;
ALTER TABLE public.ticket_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "metrics_admin_all" ON public.ticket_metrics FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));
CREATE POLICY "metrics_tech_own" ON public.ticket_metrics FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.tickets t WHERE t.id = ticket_metrics.ticket_id AND t.technician_id = auth.uid()));

-- ========== TICKET RATINGS ==========
CREATE TABLE public.ticket_ratings (
  ticket_id UUID PRIMARY KEY REFERENCES public.tickets(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  technician_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  solved BOOLEAN NOT NULL,
  stars INT NOT NULL CHECK (stars BETWEEN 1 AND 5),
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ratings_tech ON public.ticket_ratings(technician_id);
GRANT SELECT, INSERT ON public.ticket_ratings TO authenticated;
GRANT ALL ON public.ticket_ratings TO service_role;
ALTER TABLE public.ticket_ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ratings_admin_all" ON public.ticket_ratings FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));
CREATE POLICY "ratings_tech_self" ON public.ticket_ratings FOR SELECT TO authenticated
  USING (technician_id = auth.uid());
CREATE POLICY "ratings_client_self" ON public.ticket_ratings FOR SELECT TO authenticated
  USING (client_id = auth.uid());
CREATE POLICY "ratings_client_insert" ON public.ticket_ratings FOR INSERT TO authenticated
  WITH CHECK (
    client_id = auth.uid() AND EXISTS (
      SELECT 1 FROM public.tickets t
      WHERE t.id = ticket_ratings.ticket_id
        AND t.client_id = auth.uid()
        AND t.status IN ('resolved','closed')
    )
  );

-- ========== LOGIN EVENTS ==========
CREATE TABLE public.login_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role_snapshot TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_login_user ON public.login_events(user_id);
CREATE INDEX idx_login_created ON public.login_events(created_at DESC);
GRANT SELECT, INSERT ON public.login_events TO authenticated;
GRANT ALL ON public.login_events TO service_role;
ALTER TABLE public.login_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "login_admin_all" ON public.login_events FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));
CREATE POLICY "login_self_insert" ON public.login_events FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- ========== TICKET METRICS BOOTSTRAP ON CREATE ==========
CREATE OR REPLACE FUNCTION public.init_ticket_metrics()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.ticket_metrics(ticket_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
  INSERT INTO public.activity_events(actor_id, ticket_id, type, to_value, metadata)
  VALUES (NEW.client_id, NEW.id, 'ticket_created', NEW.status::text,
          jsonb_build_object('device_name', NEW.device_name, 'category', NEW.category::text));
  IF NEW.technician_id IS NOT NULL THEN
    INSERT INTO public.activity_events(actor_id, ticket_id, type, to_value)
    VALUES (NULL, NEW.id, 'ticket_assigned', NEW.technician_id::text);
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_init_ticket_metrics ON public.tickets;
CREATE TRIGGER trg_init_ticket_metrics AFTER INSERT ON public.tickets
  FOR EACH ROW EXECUTE FUNCTION public.init_ticket_metrics();

-- ========== TICKET STATUS / ASSIGNMENT EVENTS + METRICS ==========
CREATE OR REPLACE FUNCTION public.on_ticket_update_events()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.activity_events(actor_id, ticket_id, type, from_value, to_value)
    VALUES (auth.uid(), NEW.id, 'status_changed', OLD.status::text, NEW.status::text);

    IF NEW.status = 'resolved' AND OLD.status <> 'resolved' THEN
      INSERT INTO public.activity_events(actor_id, ticket_id, type)
      VALUES (auth.uid(), NEW.id, 'ticket_resolved');
      UPDATE public.ticket_metrics
        SET resolved_at = COALESCE(resolved_at, now()),
            total_resolution_seconds = EXTRACT(EPOCH FROM (now() - NEW.created_at))::INT,
            updated_at = now()
        WHERE ticket_id = NEW.id;
    END IF;
    IF NEW.status = 'closed' AND OLD.status <> 'closed' THEN
      INSERT INTO public.activity_events(actor_id, ticket_id, type)
      VALUES (auth.uid(), NEW.id, 'ticket_closed');
      UPDATE public.ticket_metrics SET closed_at = now(), updated_at = now() WHERE ticket_id = NEW.id;
    END IF;
  END IF;

  IF NEW.technician_id IS DISTINCT FROM OLD.technician_id AND NEW.technician_id IS NOT NULL THEN
    INSERT INTO public.activity_events(actor_id, ticket_id, type, from_value, to_value)
    VALUES (auth.uid(), NEW.id, CASE WHEN OLD.technician_id IS NULL THEN 'ticket_assigned' ELSE 'ticket_reassigned' END,
            OLD.technician_id::text, NEW.technician_id::text);
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_ticket_update_events ON public.tickets;
CREATE TRIGGER trg_ticket_update_events AFTER UPDATE ON public.tickets
  FOR EACH ROW EXECUTE FUNCTION public.on_ticket_update_events();

-- ========== MESSAGES → EVENTS + METRICS ==========
CREATE OR REPLACE FUNCTION public.on_message_insert_metrics()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  t RECORD;
  is_tech BOOLEAN;
  m RECORD;
  delta INT;
BEGIN
  SELECT id, client_id, technician_id, created_at INTO t FROM public.tickets WHERE id = NEW.ticket_id;
  is_tech := (t.technician_id IS NOT NULL AND NEW.sender_id = t.technician_id);

  INSERT INTO public.ticket_metrics(ticket_id) VALUES (NEW.ticket_id) ON CONFLICT DO NOTHING;
  SELECT * INTO m FROM public.ticket_metrics WHERE ticket_id = NEW.ticket_id FOR UPDATE;

  IF is_tech THEN
    INSERT INTO public.activity_events(actor_id, ticket_id, type)
    VALUES (NEW.sender_id, NEW.ticket_id,
            CASE WHEN m.first_response_at IS NULL THEN 'first_response' ELSE 'technician_replied' END);

    IF m.first_response_at IS NULL THEN
      UPDATE public.ticket_metrics
        SET first_response_at = NEW.created_at,
            first_tech_open_at = COALESCE(first_tech_open_at, NEW.created_at),
            time_to_first_response_seconds = EXTRACT(EPOCH FROM (NEW.created_at - t.created_at))::INT,
            last_tech_message_at = NEW.created_at,
            messages_count = messages_count + 1,
            updated_at = now()
        WHERE ticket_id = NEW.ticket_id;
    ELSE
      delta := 0;
      IF m.last_client_message_at IS NOT NULL AND (m.last_tech_message_at IS NULL OR m.last_client_message_at > m.last_tech_message_at) THEN
        delta := EXTRACT(EPOCH FROM (NEW.created_at - m.last_client_message_at))::INT;
      END IF;
      UPDATE public.ticket_metrics
        SET last_tech_message_at = NEW.created_at,
            messages_count = messages_count + 1,
            client_wait_seconds = client_wait_seconds + GREATEST(delta, 0),
            updated_at = now()
        WHERE ticket_id = NEW.ticket_id;
    END IF;
  ELSIF NEW.sender_id = t.client_id THEN
    INSERT INTO public.activity_events(actor_id, ticket_id, type)
    VALUES (NEW.sender_id, NEW.ticket_id, 'client_replied');
    delta := 0;
    IF m.last_tech_message_at IS NOT NULL AND (m.last_client_message_at IS NULL OR m.last_tech_message_at > m.last_client_message_at) THEN
      delta := EXTRACT(EPOCH FROM (NEW.created_at - m.last_tech_message_at))::INT;
    END IF;
    UPDATE public.ticket_metrics
      SET last_client_message_at = NEW.created_at,
          messages_count = messages_count + 1,
          tech_wait_seconds = tech_wait_seconds + GREATEST(delta, 0),
          updated_at = now()
      WHERE ticket_id = NEW.ticket_id;
  ELSE
    UPDATE public.ticket_metrics SET messages_count = messages_count + 1, updated_at = now() WHERE ticket_id = NEW.ticket_id;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_message_metrics ON public.messages;
CREATE TRIGGER trg_message_metrics AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.on_message_insert_metrics();

-- ========== RATINGS → EVENTS ==========
CREATE OR REPLACE FUNCTION public.on_rating_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.activity_events(actor_id, ticket_id, type, to_value, metadata)
  VALUES (NEW.client_id, NEW.ticket_id, 'rating_received', NEW.stars::text,
          jsonb_build_object('solved', NEW.solved, 'technician_id', NEW.technician_id));
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_rating_insert ON public.ticket_ratings;
CREATE TRIGGER trg_rating_insert AFTER INSERT ON public.ticket_ratings
  FOR EACH ROW EXECUTE FUNCTION public.on_rating_insert();

-- ========== REALTIME ==========
ALTER PUBLICATION supabase_realtime ADD TABLE public.activity_events;
ALTER PUBLICATION supabase_realtime ADD TABLE public.ticket_metrics;
ALTER PUBLICATION supabase_realtime ADD TABLE public.ticket_ratings;

-- ========== BACKFILL METRICS FOR EXISTING TICKETS ==========
INSERT INTO public.ticket_metrics(ticket_id, resolved_at, total_resolution_seconds)
SELECT id, resolved_at,
  CASE WHEN resolved_at IS NOT NULL THEN EXTRACT(EPOCH FROM (resolved_at - created_at))::INT ELSE NULL END
FROM public.tickets
ON CONFLICT DO NOTHING;
