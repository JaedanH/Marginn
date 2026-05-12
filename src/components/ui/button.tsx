import * as React from "react"

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
  size?: "default" | "sm" | "lg" | "icon";
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = "", variant = "default", size = "default", ...props }, ref) => {
    const base =
      "inline-flex items-center justify-center font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap cursor-pointer rounded-md";

    const variants: Record<string, string> = {
      default: "bg-[#1a3d2b] text-white hover:bg-[#2d5a40] focus:ring-[#1a3d2b]/30",
      destructive: "bg-red-600 text-white hover:bg-red-700 focus:ring-red-500",
      outline:
        "border-[1.5px] border-[#1a3d2b] bg-transparent text-[#1a3d2b] hover:bg-[#1a3d2b] hover:text-white focus:ring-[#1a3d2b]/30",
      secondary: "bg-gray-100 text-gray-900 hover:bg-gray-200 focus:ring-gray-300",
      ghost: "text-gray-700 hover:bg-gray-100 focus:ring-gray-300",
      link: "text-[#1a3d2b] underline-offset-4 hover:underline",
    };

    const sizes: Record<string, string> = {
      default: "px-4 py-2 text-sm",
      sm: "px-3 py-1.5 text-sm",
      lg: "px-6 py-3 text-base",
      icon: "h-9 w-9 p-0",
    };

    return (
      <button
        ref={ref}
        className={`${base} ${variants[variant] ?? variants.default} ${sizes[size] ?? sizes.default} ${className}`}
        {...props}
      />
    );
  }
);

Button.displayName = "Button";

export { Button };
