import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        // Primary — "machined" gradient (linear primary→primary-container)
        default: "text-white shadow-clinical hover:shadow-modal bg-[linear-gradient(180deg,#0F766E_0%,#005c55_100%)] hover:bg-[linear-gradient(180deg,#14857d_0%,#006a63_100%)]",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-clinical",
        // Outline — ghost border, 20% opacity
        outline:
          "surface-low border border-border/30 hover:bg-accent hover:text-accent-foreground text-foreground",
        ghost: "hover:bg-accent text-foreground",
        secondary:
          "bg-surface-container-high text-foreground hover:bg-surface-container-highest",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-sm",
        lg: "h-11 rounded-lg px-6 text-base",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
