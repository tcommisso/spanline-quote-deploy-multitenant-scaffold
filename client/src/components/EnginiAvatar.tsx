import { cn } from "@/lib/utils";

export const ENGINI_AVATAR_SRC = "/assets/engini-avatar.jpg";

type EnginiAvatarProps = {
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
};

export function EnginiAvatar({ size = "md", className }: EnginiAvatarProps) {
  const sizeClasses = {
    sm: "h-6 w-6",
    md: "h-8 w-8",
    lg: "h-14 w-14",
    xl: "h-12 w-12",
  };

  return (
    <img
      src={ENGINI_AVATAR_SRC}
      alt="Engini"
      className={cn("rounded-full object-cover shrink-0", sizeClasses[size], className)}
    />
  );
}
