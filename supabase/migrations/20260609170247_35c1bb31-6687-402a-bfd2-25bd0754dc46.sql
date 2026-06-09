
-- ============= ENUMS =============
CREATE TYPE public.app_role AS ENUM ('super_admin','admin','technician','client');
CREATE TYPE public.ticket_category AS ENUM ('hardware','software','networks','printers','operating_systems','mobile_devices','others');
CREATE TYPE public.ticket_status AS ENUM ('new','assigned','in_analysis','in_resolution','awaiting_client','resolved','closed');

-- ============= PROFILES =============
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  email TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ============= USER ROLES =============
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- ============= SECURITY DEFINER HELPERS =============
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.is_admin(_user_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin','super_admin'))
$$;

CREATE OR REPLACE FUNCTION public.is_technician(_user_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'technician')
$$;

-- ============= TECHNICIAN SPECIALIZATIONS =============
CREATE TABLE public.technician_specializations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  technician_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category public.ticket_category NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(technician_id, category)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.technician_specializations TO authenticated;
GRANT ALL ON public.technician_specializations TO service_role;
ALTER TABLE public.technician_specializations ENABLE ROW LEVEL SECURITY;

-- ============= TICKETS =============
CREATE TABLE public.tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number SERIAL UNIQUE NOT NULL,
  client_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  technician_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  device_name TEXT NOT NULL,
  brand TEXT NOT NULL,
  model TEXT NOT NULL,
  category public.ticket_category NOT NULL,
  description TEXT NOT NULL,
  status public.ticket_status NOT NULL DEFAULT 'new',
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_tickets_client ON public.tickets(client_id);
CREATE INDEX idx_tickets_technician ON public.tickets(technician_id);
CREATE INDEX idx_tickets_status ON public.tickets(status);
CREATE INDEX idx_tickets_category ON public.tickets(category);
GRANT SELECT, INSERT, UPDATE ON public.tickets TO authenticated;
GRANT ALL ON public.tickets TO service_role;
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;

-- ============= MESSAGES =============
CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_messages_ticket ON public.messages(ticket_id, created_at);
GRANT SELECT, INSERT ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- ============= ATTACHMENTS (tickets + messages) =============
CREATE TABLE public.attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID REFERENCES public.tickets(id) ON DELETE CASCADE,
  message_id UUID REFERENCES public.messages(id) ON DELETE CASCADE,
  uploader_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT,
  size_bytes BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ticket_id IS NOT NULL OR message_id IS NOT NULL)
);
CREATE INDEX idx_attachments_ticket ON public.attachments(ticket_id);
CREATE INDEX idx_attachments_message ON public.attachments(message_id);
GRANT SELECT, INSERT, DELETE ON public.attachments TO authenticated;
GRANT ALL ON public.attachments TO service_role;
ALTER TABLE public.attachments ENABLE ROW LEVEL SECURITY;

-- ============= TICKET HISTORY =============
CREATE TABLE public.ticket_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  from_value TEXT,
  to_value TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_history_ticket ON public.ticket_history(ticket_id, created_at);
GRANT SELECT, INSERT ON public.ticket_history TO authenticated;
GRANT ALL ON public.ticket_history TO service_role;
ALTER TABLE public.ticket_history ENABLE ROW LEVEL SECURITY;

-- ============= NOTIFICATIONS =============
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ticket_id UUID REFERENCES public.tickets(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT,
  read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_notifications_user ON public.notifications(user_id, created_at DESC);
GRANT SELECT, UPDATE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- ============= POLICIES =============

-- profiles
CREATE POLICY "profiles_select_self_or_admin" ON public.profiles FOR SELECT TO authenticated
  USING (auth.uid() = id OR public.is_admin(auth.uid()) OR public.is_technician(auth.uid()));
CREATE POLICY "profiles_insert_self" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update_self_or_admin" ON public.profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id OR public.is_admin(auth.uid()));

-- user_roles (read for self + admins; write only via admin server function/service role)
CREATE POLICY "user_roles_select_self_or_admin" ON public.user_roles FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

-- technician_specializations
CREATE POLICY "specializations_select_all_authed" ON public.technician_specializations FOR SELECT TO authenticated
  USING (true);
CREATE POLICY "specializations_admin_write" ON public.technician_specializations FOR INSERT TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "specializations_admin_update" ON public.technician_specializations FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()));
CREATE POLICY "specializations_admin_delete" ON public.technician_specializations FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()));

-- tickets
CREATE POLICY "tickets_select_visible" ON public.tickets FOR SELECT TO authenticated
  USING (
    client_id = auth.uid()
    OR technician_id = auth.uid()
    OR public.is_admin(auth.uid())
  );
CREATE POLICY "tickets_insert_client" ON public.tickets FOR INSERT TO authenticated
  WITH CHECK (client_id = auth.uid());
CREATE POLICY "tickets_update_assigned" ON public.tickets FOR UPDATE TO authenticated
  USING (technician_id = auth.uid() OR public.is_admin(auth.uid()) OR client_id = auth.uid());

-- messages
CREATE POLICY "messages_select_participants" ON public.messages FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tickets t WHERE t.id = ticket_id
      AND (t.client_id = auth.uid() OR t.technician_id = auth.uid() OR public.is_admin(auth.uid()))
    )
  );
CREATE POLICY "messages_insert_participants" ON public.messages FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.tickets t WHERE t.id = ticket_id
      AND (t.client_id = auth.uid() OR t.technician_id = auth.uid() OR public.is_admin(auth.uid()))
    )
  );

-- attachments
CREATE POLICY "attachments_select_participants" ON public.attachments FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tickets t
      WHERE t.id = COALESCE(attachments.ticket_id, (SELECT m.ticket_id FROM public.messages m WHERE m.id = attachments.message_id))
      AND (t.client_id = auth.uid() OR t.technician_id = auth.uid() OR public.is_admin(auth.uid()))
    )
  );
CREATE POLICY "attachments_insert_self" ON public.attachments FOR INSERT TO authenticated
  WITH CHECK (uploader_id = auth.uid());

-- ticket_history
CREATE POLICY "history_select_participants" ON public.ticket_history FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tickets t WHERE t.id = ticket_id
      AND (t.client_id = auth.uid() OR t.technician_id = auth.uid() OR public.is_admin(auth.uid()))
    )
  );
CREATE POLICY "history_insert_authed" ON public.ticket_history FOR INSERT TO authenticated
  WITH CHECK (true);

-- notifications
CREATE POLICY "notifications_select_own" ON public.notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "notifications_update_own" ON public.notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

-- ============= TRIGGERS =============

-- updated_at
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_profiles_touch BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_tickets_touch BEFORE UPDATE ON public.tickets
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Auto-create profile + assign first-user as super_admin, others as client
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  user_count INT;
BEGIN
  INSERT INTO public.profiles(id, full_name, email, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email,'@',1)),
    NEW.email,
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;

  SELECT COUNT(*) INTO user_count FROM public.user_roles;
  IF user_count = 0 THEN
    INSERT INTO public.user_roles(user_id, role) VALUES (NEW.id, 'super_admin');
  ELSE
    INSERT INTO public.user_roles(user_id, role) VALUES (NEW.id, 'client')
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Auto-assign technician with least active tickets in the category
CREATE OR REPLACE FUNCTION public.auto_assign_ticket()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  chosen_tech UUID;
BEGIN
  IF NEW.technician_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT ts.technician_id INTO chosen_tech
  FROM public.technician_specializations ts
  WHERE ts.category = NEW.category
    AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = ts.technician_id AND ur.role = 'technician')
  ORDER BY (
    SELECT COUNT(*) FROM public.tickets t
    WHERE t.technician_id = ts.technician_id
      AND t.status NOT IN ('resolved','closed')
  ) ASC, random()
  LIMIT 1;

  IF chosen_tech IS NOT NULL THEN
    NEW.technician_id := chosen_tech;
    NEW.status := 'assigned';
  END IF;

  RETURN NEW;
END; $$;

CREATE TRIGGER trg_auto_assign
  BEFORE INSERT ON public.tickets
  FOR EACH ROW EXECUTE FUNCTION public.auto_assign_ticket();

-- Log ticket creation + status changes + assignment changes
CREATE OR REPLACE FUNCTION public.log_ticket_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.ticket_history(ticket_id, actor_id, action, to_value)
    VALUES (NEW.id, NEW.client_id, 'created', NEW.status::text);
    IF NEW.technician_id IS NOT NULL THEN
      INSERT INTO public.ticket_history(ticket_id, actor_id, action, to_value)
      VALUES (NEW.id, NULL, 'assigned', NEW.technician_id::text);
      INSERT INTO public.notifications(user_id, ticket_id, title, body)
      VALUES (NEW.technician_id, NEW.id, 'Novo ticket atribuído', NEW.device_name || ' — ' || NEW.category::text);
    END IF;
    INSERT INTO public.notifications(user_id, ticket_id, title, body)
    SELECT ur.user_id, NEW.id, 'Novo ticket criado', NEW.device_name
    FROM public.user_roles ur WHERE ur.role IN ('admin','super_admin');
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      INSERT INTO public.ticket_history(ticket_id, actor_id, action, from_value, to_value)
      VALUES (NEW.id, auth.uid(), 'status_changed', OLD.status::text, NEW.status::text);
      IF NEW.status = 'resolved' AND OLD.status <> 'resolved' THEN
        NEW.resolved_at := now();
      END IF;
      INSERT INTO public.notifications(user_id, ticket_id, title, body)
      VALUES (NEW.client_id, NEW.id, 'Estado do ticket atualizado', NEW.status::text);
    END IF;
    IF NEW.technician_id IS DISTINCT FROM OLD.technician_id THEN
      INSERT INTO public.ticket_history(ticket_id, actor_id, action, from_value, to_value)
      VALUES (NEW.id, auth.uid(), 'assignment_changed', OLD.technician_id::text, NEW.technician_id::text);
      IF NEW.technician_id IS NOT NULL THEN
        INSERT INTO public.notifications(user_id, ticket_id, title, body)
        VALUES (NEW.technician_id, NEW.id, 'Ticket atribuído', NEW.device_name);
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_ticket_insert_log
  AFTER INSERT ON public.tickets
  FOR EACH ROW EXECUTE FUNCTION public.log_ticket_change();
CREATE TRIGGER trg_ticket_update_log
  BEFORE UPDATE ON public.tickets
  FOR EACH ROW EXECUTE FUNCTION public.log_ticket_change();

-- Notify on new message
CREATE OR REPLACE FUNCTION public.notify_on_message()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  t RECORD;
BEGIN
  SELECT client_id, technician_id, device_name INTO t FROM public.tickets WHERE id = NEW.ticket_id;
  IF t.client_id <> NEW.sender_id THEN
    INSERT INTO public.notifications(user_id, ticket_id, title, body)
    VALUES (t.client_id, NEW.ticket_id, 'Nova mensagem', LEFT(NEW.content, 80));
  END IF;
  IF t.technician_id IS NOT NULL AND t.technician_id <> NEW.sender_id THEN
    INSERT INTO public.notifications(user_id, ticket_id, title, body)
    VALUES (t.technician_id, NEW.ticket_id, 'Nova mensagem', LEFT(NEW.content, 80));
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_message_notify
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_message();

-- ============= REALTIME =============
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.tickets;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
