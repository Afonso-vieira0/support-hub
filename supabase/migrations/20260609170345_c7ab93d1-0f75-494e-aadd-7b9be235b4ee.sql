
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.auto_assign_ticket() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_ticket_change() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_on_message() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.touch_updated_at() FROM PUBLIC, anon, authenticated;

-- Storage policies for ticket-attachments
CREATE POLICY "attachments_select_participants" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'ticket-attachments' AND (
    public.is_admin(auth.uid()) OR EXISTS (
      SELECT 1 FROM public.attachments a
      JOIN public.tickets t ON t.id = COALESCE(a.ticket_id, (SELECT m.ticket_id FROM public.messages m WHERE m.id = a.message_id))
      WHERE a.file_path = name
        AND (t.client_id = auth.uid() OR t.technician_id = auth.uid())
    )
  )
);

CREATE POLICY "attachments_insert_authed" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'ticket-attachments' AND owner = auth.uid());

CREATE POLICY "attachments_delete_own_or_admin" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'ticket-attachments' AND (owner = auth.uid() OR public.is_admin(auth.uid())));
