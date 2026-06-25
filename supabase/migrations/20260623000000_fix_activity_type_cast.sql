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
            (CASE WHEN m.first_response_at IS NULL THEN 'first_response' ELSE 'technician_replied' END)::public.activity_type);
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
