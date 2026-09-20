import { useState, type ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useTranslation } from "react-i18next";

export interface ConfirmOptions {
  /** Message shown in the dialog body. */
  message: string;
  /** Optional title above the message. */
  title?: string;
  /** Label for the confirming (destructive) button. Defaults to common.confirm. */
  confirmLabel?: string;
  /** Label for the dismiss button. Defaults to common.cancel. */
  cancelLabel?: string;
  /** Use destructive styling for the confirm button (default true). */
  destructive?: boolean;
}

/**
 * Promise-based confirmation dialog — the in-app replacement for
 * `window.confirm`, which is broken in Tauri webviews (desktop overrides it
 * with a plugin script that resolves asynchronously and targets a command
 * that does not exist; Android relies on native JS dialogs that are
 * unreliable right after the SAF file picker returns).
 *
 * Usage:
 *   const ok = await confirmDialog({ message: t("...") });
 *   if (!ok) return;
 */
export function useConfirmDialog() {
  const [request, setRequest] = useState<
    (ConfirmOptions & { resolve: (ok: boolean) => void }) | null
  >(null);
  const { t } = useTranslation();

  const confirmDialog = (options: ConfirmOptions): Promise<boolean> =>
    new Promise<boolean>((resolve) => setRequest({ ...options, resolve }));

  const settle = (ok: boolean) => {
    request?.resolve(ok);
    setRequest(null);
  };

  const dialog: ReactNode = (
    <AlertDialog
      open={request !== null}
      onOpenChange={(open) => {
        if (!open) settle(false);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          {request?.title && (
            <AlertDialogTitle>{request.title}</AlertDialogTitle>
          )}
          <AlertDialogDescription>{request?.message}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => settle(false)}>
            {request?.cancelLabel ?? t("common.cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            className={
              request?.destructive === false
                ? undefined
                : "bg-destructive text-destructive-foreground hover:bg-destructive/90"
            }
            onClick={(e) => {
              e.preventDefault(); // keep the dialog mounted until the caller resumes
              settle(true);
            }}
          >
            {request?.confirmLabel ?? t("common.confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return { confirmDialog, confirmDialogElement: dialog };
}
