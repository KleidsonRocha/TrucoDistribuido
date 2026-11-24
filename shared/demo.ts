import {z} from 'zod';

export const DemoSessionSchema=z.object({enabled:z.boolean(),authenticated:z.boolean(),csrfToken:z.string().nullable()});
export const DemoStateSchema=z.object({
  busy:z.boolean(),
  nodes:z.array(z.object({id:z.number().int().min(1).max(3),running:z.boolean(),paused:z.boolean()})).length(3),
});
export type DemoSession=z.infer<typeof DemoSessionSchema>;
export type DemoState=z.infer<typeof DemoStateSchema>;
