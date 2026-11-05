import { Router } from 'express';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { database } from '../lib/firebaseAdmin.js';
import { auth, allow } from '../middleware/auth.js';

const router = Router();
router.use(auth);
const schemas = {
  students: z.object({
    name: z.string().trim().min(2).max(120), rollNumber: z.string().trim().min(1).max(40),
    registrationNumber: z.string().trim().min(1).max(60), email: z.string().email().optional().or(z.literal('')),
    phone: z.string().max(20).optional(), session: z.string().max(40).optional(),
    course: z.string().max(120).optional(), status: z.enum(['ACTIVE', 'INACTIVE']).optional()
  }),
  subjects: z.object({
    name: z.string().trim().min(2).max(120), code: z.string().trim().min(1).max(30),
    maxMarks: z.coerce.number().positive().max(10000), passMarks: z.coerce.number().nonnegative().max(10000),
    course: z.string().max(120).optional()
  }).refine((v) => v.passMarks <= v.maxMarks, { message: 'Pass marks cannot exceed maximum marks.' }),
  exams: z.object({
    name: z.string().trim().min(2).max(120), type: z.enum(['ONLINE', 'OFFLINE']), date: z.string().optional(),
    course: z.string().max(120).optional(), session: z.string().max(40).optional(),
    durationMinutes: z.coerce.number().positive().max(1440).optional(), status: z.string().max(30).optional(),
    subjects: z.coerce.number().int().nonnegative().optional()
  })
};
const tenantRoot = (req, collection) => database().ref(`institutions/${req.user.institutionId}/${collection}`);

for (const [collection, schema] of Object.entries(schemas)) {
  router.get(`/${collection}`, allow('SUPER_ADMIN', 'INSTITUTION_ADMIN', 'TEACHER'), async (req, res, next) => {
    try {
      const snap = await tenantRoot(req, collection).get();
      let items = Object.entries(snap.val() || {}).map(([id, value]) => ({ id, ...value }));
      const query = String(req.query.search || '').trim().toLowerCase();
      if (query) items = items.filter((item) => JSON.stringify(item).toLowerCase().includes(query));
      items.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
      const page = Math.max(1, Number(req.query.page) || 1);
      const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
      res.json({ items: items.slice((page - 1) * limit, page * limit), total: items.length, page, limit });
    } catch (error) { next(error); }
  });

  router.post(`/${collection}`, allow('SUPER_ADMIN', 'INSTITUTION_ADMIN', 'TEACHER'), async (req, res, next) => {
    try {
      const data = schema.parse(req.body);
      const ref = tenantRoot(req, collection);
      const existing = Object.values((await ref.get()).val() || {});
      if (collection === 'students' && existing.some((item) => item.registrationNumber?.toLowerCase() === data.registrationNumber.toLowerCase())) return res.status(409).json({ message: 'Registration number already exists in this institution.' });
      if (collection === 'students' && existing.some((item) => item.rollNumber?.toLowerCase() === data.rollNumber.toLowerCase())) return res.status(409).json({ message: 'Roll number already exists in this institution.' });
      if (collection === 'subjects' && existing.some((item) => item.code?.toLowerCase() === data.code.toLowerCase())) return res.status(409).json({ message: 'Subject code already exists in this institution.' });
      const id = randomUUID();
      const now = new Date().toISOString();
      const item = { ...data, createdAt: now, updatedAt: now, createdBy: req.user.uid };
      await ref.child(id).set(item);
      res.status(201).json({ id, ...item });
    } catch (error) { next(error); }
  });

  router.put(`/${collection}/:id`, allow('SUPER_ADMIN', 'INSTITUTION_ADMIN', 'TEACHER'), async (req, res, next) => {
    try {
      const ref = tenantRoot(req, collection).child(req.params.id);
      const snap = await ref.get();
      if (!snap.exists()) return res.status(404).json({ message: 'Record not found in the selected institution.' });
      const data = schema.partial().parse(req.body);
      if (collection === 'subjects' && data.passMarks !== undefined && data.maxMarks !== undefined && data.passMarks > data.maxMarks) return res.status(400).json({ message: 'Pass marks cannot exceed maximum marks.' });
      await ref.update({ ...data, updatedAt: new Date().toISOString(), updatedBy: req.user.uid });
      res.json({ id: req.params.id, ...snap.val(), ...data });
    } catch (error) { next(error); }
  });

  router.delete(`/${collection}/:id`, allow('SUPER_ADMIN', 'INSTITUTION_ADMIN'), async (req, res, next) => {
    try {
      const ref = tenantRoot(req, collection).child(req.params.id);
      if (!(await ref.get()).exists()) return res.status(404).json({ message: 'Record not found in the selected institution.' });
      await ref.remove();
      res.status(204).end();
    } catch (error) { next(error); }
  });
}

export default router;
