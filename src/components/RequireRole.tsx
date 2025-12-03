import { ReactNode } from "react";

interface RequireRoleProps {
  children: ReactNode;
  role?: string;
}

/**
 * Temporary stub: always renders children without checking auth.
 */
export function RequireRole({ children }: RequireRoleProps) {
  return <>{children}</>;
}

export default RequireRole;
