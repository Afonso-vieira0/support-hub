
-- Tickets: client only sees own tickets that are NOT resolved/closed
DROP POLICY IF EXISTS tickets_select_visible ON public.tickets;
CREATE POLICY tickets_select_visible ON public.tickets FOR SELECT
USING (
  (client_id = auth.uid() AND status NOT IN ('resolved','closed'))
  OR technician_id = auth.uid()
  OR public.is_admin(auth.uid())
);

-- Tickets: client can no longer update resolved/closed tickets
DROP POLICY IF EXISTS tickets_update_assigned ON public.tickets;
CREATE POLICY tickets_update_assigned ON public.tickets FOR UPDATE
USING (
  technician_id = auth.uid()
  OR public.is_admin(auth.uid())
  OR (client_id = auth.uid() AND status NOT IN ('resolved','closed'))
);

-- Messages: filter via ticket visibility (same rule)
DROP POLICY IF EXISTS messages_select_participants ON public.messages;
CREATE POLICY messages_select_participants ON public.messages FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.tickets t
    WHERE t.id = messages.ticket_id
      AND (
        (t.client_id = auth.uid() AND t.status NOT IN ('resolved','closed'))
        OR t.technician_id = auth.uid()
        OR public.is_admin(auth.uid())
      )
  )
);

-- Messages: client cannot insert on resolved/closed; tech/admin always can
DROP POLICY IF EXISTS messages_insert_participants ON public.messages;
CREATE POLICY messages_insert_participants ON public.messages FOR INSERT
WITH CHECK (
  sender_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.tickets t
    WHERE t.id = messages.ticket_id
      AND (
        (t.client_id = auth.uid() AND t.status NOT IN ('resolved','closed'))
        OR t.technician_id = auth.uid()
        OR public.is_admin(auth.uid())
      )
  )
);

-- Attachments: same access rule
DROP POLICY IF EXISTS attachments_select_participants ON public.attachments;
CREATE POLICY attachments_select_participants ON public.attachments FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.tickets t
    WHERE t.id = COALESCE(attachments.ticket_id, (SELECT m.ticket_id FROM public.messages m WHERE m.id = attachments.message_id))
      AND (
        (t.client_id = auth.uid() AND t.status NOT IN ('resolved','closed'))
        OR t.technician_id = auth.uid()
        OR public.is_admin(auth.uid())
      )
  )
);
