
-- Columns
ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by UUID,
  ADD COLUMN IF NOT EXISTS delete_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_tickets_deleted_at ON public.tickets(deleted_at) WHERE deleted_at IS NOT NULL;

-- Extend activity_events.type if it is an enum; otherwise it's text and accepts new values.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_attribute a ON a.atttypid = t.oid
    WHERE a.attrelid = 'public.activity_events'::regclass
      AND a.attname = 'type'
      AND t.typtype = 'e'
  ) THEN
    BEGIN
      EXECUTE 'ALTER TYPE ' || (
        SELECT quote_ident(n.nspname) || '.' || quote_ident(t.typname)
        FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
        JOIN pg_attribute a ON a.atttypid = t.oid
        WHERE a.attrelid = 'public.activity_events'::regclass AND a.attname = 'type'
      ) || ' ADD VALUE IF NOT EXISTS ''ticket_deleted''';
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    BEGIN
      EXECUTE 'ALTER TYPE ' || (
        SELECT quote_ident(n.nspname) || '.' || quote_ident(t.typname)
        FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
        JOIN pg_attribute a ON a.atttypid = t.oid
        WHERE a.attrelid = 'public.activity_events'::regclass AND a.attname = 'type'
      ) || ' ADD VALUE IF NOT EXISTS ''ticket_restored''';
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;

-- Update RLS policies on tickets
DROP POLICY IF EXISTS tickets_select_visible ON public.tickets;
CREATE POLICY tickets_select_visible ON public.tickets
FOR SELECT TO authenticated
USING (
  is_admin(auth.uid())
  OR (
    deleted_at IS NULL
    AND (
      (client_id = auth.uid() AND status <> ALL (ARRAY['resolved'::ticket_status, 'closed'::ticket_status]))
      OR technician_id = auth.uid()
    )
  )
);

DROP POLICY IF EXISTS tickets_update_assigned ON public.tickets;
CREATE POLICY tickets_update_assigned ON public.tickets
FOR UPDATE TO authenticated
USING (
  is_admin(auth.uid())
  OR (
    deleted_at IS NULL
    AND (
      technician_id = auth.uid()
      OR (client_id = auth.uid() AND status <> ALL (ARRAY['resolved'::ticket_status, 'closed'::ticket_status]))
    )
  )
)
WITH CHECK (
  is_admin(auth.uid())
  OR technician_id = auth.uid()
  OR (client_id = auth.uid() AND status <> ALL (ARRAY['resolved'::ticket_status, 'closed'::ticket_status]))
);

-- DELETE policy (hard delete) — admins only
DROP POLICY IF EXISTS tickets_delete_admin ON public.tickets;
CREATE POLICY tickets_delete_admin ON public.tickets
FOR DELETE TO authenticated
USING (is_admin(auth.uid()));

-- Trigger: log delete/restore events
CREATE OR REPLACE FUNCTION public.on_ticket_soft_delete_events()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.deleted_at IS DISTINCT FROM OLD.deleted_at THEN
    IF NEW.deleted_at IS NOT NULL THEN
      INSERT INTO public.activity_events(actor_id, ticket_id, type, metadata)
      VALUES (auth.uid(), NEW.id, 'ticket_deleted',
              jsonb_build_object('reason', NEW.delete_reason));
    ELSE
      INSERT INTO public.activity_events(actor_id, ticket_id, type)
      VALUES (auth.uid(), NEW.id, 'ticket_restored');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ticket_soft_delete_events ON public.tickets;
CREATE TRIGGER trg_ticket_soft_delete_events
AFTER UPDATE OF deleted_at ON public.tickets
FOR EACH ROW EXECUTE FUNCTION public.on_ticket_soft_delete_events();
