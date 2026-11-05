import React from 'react';

// The tenant shell is composed by App because its navigation and header depend
// on the selected tenant, loaded modules, and the user's tenant-scoped role.
// This layout boundary makes the institute workspace explicit and reusable.
export default function InstitutionLayout({ children }) {
  return <div className="institution-layout">{children}</div>;
}
