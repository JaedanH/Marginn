import { ButtonHTMLAttributes, ReactNode } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  children: ReactNode;
  loading?: boolean;
}

export default function Button({
  variant = 'primary',
  size = 'md',
  children,
  loading = false,
  className = '',
  disabled,
  ...props
}: ButtonProps) {
  const base =
    'inline-flex items-center justify-center font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap cursor-pointer rounded-md';

  const variants = {
    primary:
      'bg-[#1a3d2b] text-white hover:bg-[#2d5a40] focus:ring-[#1a3d2b]/30',
    secondary:
      'bg-gray-700 text-white hover:bg-gray-800 focus:ring-gray-500',
    outline:
      'border-[1.5px] border-[#1a3d2b] bg-transparent text-[#1a3d2b] hover:bg-[#1a3d2b] hover:text-white focus:ring-[#1a3d2b]/30',
    ghost:
      'text-gray-700 hover:bg-gray-100 focus:ring-[#1a3d2b]/30',
  };

  const sizes = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-sm',
    lg: 'px-6 py-3 text-base',
  };

  return (
    <button
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <i className="ri-loader-4-line animate-spin mr-2" />}
      {children}
    </button>
  );
}
