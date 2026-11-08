import { Redis } from 'ioredis';

const redis = new Redis(process.env.REDIS_URL);

await redis.psubscribe('membership.*');
console.log('Escuchando eventos membership.* ...');

redis.on('pmessage', (_pattern, channel, message) => {
  console.log(`\nEvento recibido en ${channel}:`);
  console.log(JSON.parse(message));
});