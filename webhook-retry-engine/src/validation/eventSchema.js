const { z } = require('zod');

const eventSchema = z.object({
  eventId: z.string().min(1, 'eventId is required'),
  type: z.string().min(1, 'type is required'),
  occurredAt: z.string().datetime({ message: 'occurredAt must be a valid ISO 8601 datetime' }),
  payload: z.object({}).passthrough(), 
  clientId: z.string().min(1).optional(),
});

module.exports = { eventSchema };