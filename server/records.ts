import { z } from 'zod';
import { validDay } from '../shared/productivity.js';
const optionalText = z.string().max(100_000).nullable().optional();
const base = z.object({
  id: z.string().min(1).max(120), created: z.number().finite().optional(), updated: z.number().finite().optional(), example: z.boolean().optional(),
});
const task = base.extend({
  kind: z.literal('task'), title: z.string().trim().min(1).max(500),
  checkInAfter:z.number().finite().nonnegative().optional(),checkInDismissedFor:z.string().max(40).optional(),
  q: z.number().int().min(1).max(4).optional(), done: z.boolean().optional(), top: z.boolean().optional(),
  due: z.string().refine(validDay, 'Use a real date in YYYY-MM-DD format.').nullable().optional(),
  time: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/).nullable().optional(),
  remind: z.number().int().min(-1).max(525600).nullable().optional(),
  items: z.array(z.object({ t:z.string().max(5000), done:z.boolean() })).max(500).optional(),
  delegate: optionalText, assigneeId: z.string().max(120).optional(), details:optionalText, source:optionalText, said:optionalText,
}).passthrough();
const note = base.extend({ kind:z.literal('note'), type:z.enum(['note','journal']), text:z.string().max(100_000), day:z.string().optional() }).passthrough();
const habit = base.extend({ kind:z.literal('habit'), name:z.string().min(1).max(500), log:z.record(z.string(), z.boolean()).optional() }).passthrough();
const voice = base.extend({ kind:z.literal('voice'), text:z.string().max(100_000), dur:z.number().nonnegative().optional(), audioId:optionalText, summary:optionalText, organized:z.boolean().optional() }).passthrough();
const conversation=base.extend({kind:z.literal('conversation'),messages:z.array(z.object({id:z.string().max(120),role:z.enum(['user','assistant']),content:z.string().max(12000)})).max(100)});
export const recordSchema = z.discriminatedUnion('kind', [task,note,habit,voice,conversation]);
