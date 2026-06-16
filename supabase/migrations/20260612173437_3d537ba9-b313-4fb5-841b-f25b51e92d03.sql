
-- Enum for part categories
DO $$ BEGIN
  CREATE TYPE public.part_category AS ENUM ('ram','ssd','hdd','psu','screen','battery','cable','motherboard','cpu','gpu','keyboard','other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.inventory_movement_reason AS ENUM ('purchase','adjustment','ticket_use','return','initial');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Parts table
CREATE TABLE public.inventory_parts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category public.part_category NOT NULL DEFAULT 'other',
  unit TEXT NOT NULL DEFAULT 'un',
  quantity INT NOT NULL DEFAULT 0,
  min_quantity INT NOT NULL DEFAULT 0,
  unit_cost NUMERIC(10,2) NOT NULL DEFAULT 0,
  location TEXT,
  notes TEXT,
  archived_at TIMESTAMPTZ,
  low_stock_notified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_parts TO authenticated;
GRANT ALL ON public.inventory_parts TO service_role;
ALTER TABLE public.inventory_parts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin and technicians read parts"
  ON public.inventory_parts FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()) OR public.is_technician(auth.uid()));

CREATE POLICY "Admins manage parts"
  ON public.inventory_parts FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE TRIGGER trg_parts_touch BEFORE UPDATE ON public.inventory_parts
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Movements table
CREATE TABLE public.inventory_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  part_id UUID NOT NULL REFERENCES public.inventory_parts(id) ON DELETE CASCADE,
  ticket_id UUID REFERENCES public.tickets(id) ON DELETE SET NULL,
  actor_id UUID,
  delta INT NOT NULL,
  reason public.inventory_movement_reason NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_inv_mov_part ON public.inventory_movements(part_id, created_at DESC);
CREATE INDEX idx_inv_mov_ticket ON public.inventory_movements(ticket_id);

GRANT SELECT, INSERT ON public.inventory_movements TO authenticated;
GRANT ALL ON public.inventory_movements TO service_role;
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin and technicians read movements"
  ON public.inventory_movements FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()) OR public.is_technician(auth.uid()));

CREATE POLICY "Admins insert any movement"
  ON public.inventory_movements FOR INSERT TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));

-- Ticket parts used
CREATE TABLE public.ticket_parts_used (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  part_id UUID NOT NULL REFERENCES public.inventory_parts(id) ON DELETE RESTRICT,
  quantity INT NOT NULL CHECK (quantity > 0),
  actor_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_tpu_ticket ON public.ticket_parts_used(ticket_id);

GRANT SELECT, INSERT, DELETE ON public.ticket_parts_used TO authenticated;
GRANT ALL ON public.ticket_parts_used TO service_role;
ALTER TABLE public.ticket_parts_used ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read ticket parts if can see ticket"
  ON public.ticket_parts_used FOR SELECT TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.tickets t
      WHERE t.id = ticket_id
        AND (t.client_id = auth.uid() OR t.technician_id = auth.uid())
    )
  );

CREATE POLICY "Admin or assigned tech insert ticket parts"
  ON public.ticket_parts_used FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.tickets t
      WHERE t.id = ticket_id AND t.technician_id = auth.uid()
    )
  );

CREATE POLICY "Admin or assigned tech delete ticket parts"
  ON public.ticket_parts_used FOR DELETE TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.tickets t
      WHERE t.id = ticket_id AND t.technician_id = auth.uid()
    )
  );

-- Trigger: apply ticket_parts_used → movement + decrement stock + low stock notification
CREATE OR REPLACE FUNCTION public.apply_ticket_part_use()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_qty INT;
  p RECORD;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT * INTO p FROM public.inventory_parts WHERE id = NEW.part_id FOR UPDATE;
    IF p.quantity < NEW.quantity THEN
      RAISE EXCEPTION 'Stock insuficiente para %', p.name;
    END IF;
    new_qty := p.quantity - NEW.quantity;
    UPDATE public.inventory_parts SET quantity = new_qty, updated_at = now() WHERE id = NEW.part_id;
    INSERT INTO public.inventory_movements(part_id, ticket_id, actor_id, delta, reason, notes)
      VALUES (NEW.part_id, NEW.ticket_id, NEW.actor_id, -NEW.quantity, 'ticket_use', NULL);
    IF new_qty <= p.min_quantity AND p.low_stock_notified_at IS NULL THEN
      INSERT INTO public.notifications(user_id, ticket_id, title, body)
      SELECT ur.user_id, NEW.ticket_id, 'Stock baixo', p.name || ' — restam ' || new_qty
      FROM public.user_roles ur WHERE ur.role IN ('admin','super_admin');
      UPDATE public.inventory_parts SET low_stock_notified_at = now() WHERE id = NEW.part_id;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.inventory_parts
      SET quantity = quantity + OLD.quantity,
          low_stock_notified_at = CASE WHEN quantity + OLD.quantity > min_quantity THEN NULL ELSE low_stock_notified_at END,
          updated_at = now()
      WHERE id = OLD.part_id;
    INSERT INTO public.inventory_movements(part_id, ticket_id, actor_id, delta, reason, notes)
      VALUES (OLD.part_id, OLD.ticket_id, OLD.actor_id, OLD.quantity, 'return', 'Reversão');
    RETURN OLD;
  END IF;
  RETURN NULL;
END; $$;

CREATE TRIGGER trg_apply_ticket_part_use
AFTER INSERT OR DELETE ON public.ticket_parts_used
FOR EACH ROW EXECUTE FUNCTION public.apply_ticket_part_use();

-- Stats RPC for top consumed parts in last N days
CREATE OR REPLACE FUNCTION public.inventory_top_consumed(_days INT DEFAULT 30, _limit INT DEFAULT 5)
RETURNS TABLE(part_id UUID, name TEXT, total_used BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.name, COALESCE(SUM(tpu.quantity),0)::BIGINT AS total_used
  FROM public.inventory_parts p
  LEFT JOIN public.ticket_parts_used tpu
    ON tpu.part_id = p.id AND tpu.created_at >= now() - (_days || ' days')::interval
  GROUP BY p.id, p.name
  HAVING COALESCE(SUM(tpu.quantity),0) > 0
  ORDER BY total_used DESC
  LIMIT _limit;
$$;
