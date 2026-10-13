import { z } from 'zod';

export const profileSettingsSchema = z.object({
  section: z.literal('profile'),
  name: z.string().trim().min(1, 'Enter your name.').max(120),
  preferredRoleTitle: z.string().trim().max(160),
}).strict();

export const appearanceSettingsSchema = z.object({
  section: z.literal('appearance'),
  reduceMotion: z.boolean(),
}).strict();

export const settingsUpdateSchema = z.discriminatedUnion('section', [
  profileSettingsSchema,
  appearanceSettingsSchema,
]);

export const passwordUpdateSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(12, 'Use at least 12 characters.').max(128),
}).strict().refine((data) => Buffer.byteLength(data.newPassword, 'utf8') <= 72, {
  message: 'The password must not exceed 72 UTF-8 bytes.',
  path: ['newPassword'],
});
