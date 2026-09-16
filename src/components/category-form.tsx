import type { FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet, SheetContent,
} from "@/components/ui/sheet";

interface CategoryFormProps {
  open: boolean;
  editing: boolean;
  name: string;
  pending: boolean;
  error?: string;
  onOpenChange: (open: boolean) => void;
  onNameChange: (name: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

export const CategoryForm = ({
  open, editing, name, pending, error, onOpenChange, onNameChange, onSubmit,
}: CategoryFormProps): JSX.Element => (
  <Sheet open={open} onOpenChange={onOpenChange}>
    <SheetContent
      title={editing ? "Đổi tên phân loại" : "Thêm phân loại"}
      description={editing
            ? "Tên mới sẽ được cập nhật cho tất cả mã hàng trong phân loại này."
            : "Tạo phân loại trước rồi gán mã hàng trong màn chi tiết sản phẩm."}
    >
      <form className="mt-6 space-y-4" onSubmit={onSubmit}>
        {error ? (
          <div className="rounded-md border border-danger-border bg-danger-surface px-3 py-2 text-sm text-danger">
            {error}
          </div>
        ) : null}
        <div className="space-y-2">
          <Label htmlFor="category-name">Tên phân loại</Label>
          <Input id="category-name" autoFocus value={name} placeholder="Nhập tên phân loại"
            onChange={(event) => onNameChange(event.target.value)} />
        </div>
        <div className="flex justify-end gap-2 border-t border-line pt-4">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Hủy</Button>
          <Button type="submit" disabled={!name.trim() || pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {editing ? "Lưu thay đổi" : "Tạo phân loại"}
          </Button>
        </div>
      </form>
    </SheetContent>
  </Sheet>
);
