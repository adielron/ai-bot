import * as React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
   children: React.ReactNode;
}

export function Button({ children, className = '', ...props }: ButtonProps) {
   return (
      <button
         className={`flex items-center justify-center bg-black text-white rounded-full hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-500 ${className}`}
         {...props}
      >
         {children}
      </button>
   );
}
