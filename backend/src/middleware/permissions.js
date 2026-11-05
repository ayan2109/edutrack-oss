export function allow(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) return res.status(403).json({ message: 'Insufficient permissions' });
    next();
  };
}

export function requireInstitutionAdmin(req, res, next) {
  if (req.user?.platformRole === 'SUPER_ADMIN' || req.user?.role === 'INSTITUTION_ADMIN') return next();
  return res.status(403).json({ message: 'Institution administrator permission required.' });
}
