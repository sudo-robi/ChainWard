"use client";

import React, { createContext, useContext, useState, ReactNode } from 'react';

export type Role = 'admin' | 'operator' | 'viewer';

const RoleContext = createContext<{
  role: Role;
  setRole: (role: Role) => void;
}>({ role: 'viewer', setRole: () => { } });

export const useRole = () => useContext(RoleContext);

export const RoleProvider = ({ children }: { children: ReactNode }) => {
  const [role, setRole] = useState<Role>('admin');
  return (
    <RoleContext.Provider value={{ role, setRole }}>
      {children}
    </RoleContext.Provider>
  );
};
