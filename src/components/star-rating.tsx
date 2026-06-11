import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

export function StarRating({ value, onChange, size = 20, readOnly = false }: {
  value: number;
  onChange?: (v: number) => void;
  size?: number;
  readOnly?: boolean;
}) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={readOnly}
          onClick={() => onChange?.(n)}
          className={cn("transition-transform", !readOnly && "hover:scale-110")}
          aria-label={`${n} estrelas`}
        >
          <Star
            style={{ width: size, height: size }}
            className={cn(n <= value ? "fill-warning text-warning" : "text-muted-foreground/40")}
          />
        </button>
      ))}
    </div>
  );
}