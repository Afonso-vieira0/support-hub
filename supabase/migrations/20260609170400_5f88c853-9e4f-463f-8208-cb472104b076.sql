
REVOKE EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_admin(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_technician(UUID) FROM PUBLIC, anon;

DROP POLICY IF EXISTS "history_insert_authed" ON public.ticket_history;
CREATE POLICY "history_insert_participants" ON public.ticket_history FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tickets t WHERE t.id = ticket_id
      AND (t.client_id = auth.uid() OR t.technician_id = auth.uid() OR public.is_admin(auth.uid()))
    )
  );
