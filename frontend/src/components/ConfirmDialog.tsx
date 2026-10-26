import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

export interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  confirmLabel: string
  cancelLabel?: string
  secondaryLabel?: string
  onConfirm: () => void
  onSecondary?: () => void
  destructive?: boolean
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancel',
  secondaryLabel,
  onConfirm,
  onSecondary,
  destructive = false,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {cancelLabel}
          </Button>
          {secondaryLabel && onSecondary ? (
            <Button type="button" variant="secondary" onClick={onSecondary}>
              {secondaryLabel}
            </Button>
          ) : null}
          <Button
            type="button"
            variant={destructive ? 'destructive' : 'default'}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
