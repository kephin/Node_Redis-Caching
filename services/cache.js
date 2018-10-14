const { Query } = require('mongoose');
const redis = require('redis');
const { promisify } = require('util');

const redisUrl = 'redis://127.0.0.1:6379';
const client = redis.createClient(redisUrl);
client.hget = promisify(client.hget);

const { exec } = Query.prototype;

Query.prototype.cache = function cache(options = {}) {
  this.useCache = true;
  this.hashKey = JSON.stringify(options.key || '');

  return this;
};

Query.prototype.exec = async function overrideExec(...params) {
  if (!this.useCache) return exec.apply(this, params);

  const key = JSON.stringify({
    ...this.getQuery(),
    collection: this.mongooseCollection.name,
  });

  try {
    // see if we have value for 'key' in redis
    const cacheValue = await client.hget(this.hashKey, key);

    // if we do, return the value
    if (cacheValue) {
      const cacheObject = JSON.parse(cacheValue);

      return Array.isArray(cacheObject)
        ? cacheObject.map(doc => new this.model(doc))
        : new this.model(cacheObject);
    }

    // otherwise, issue the query and store the result in redis
    const result = await exec.apply(this, params);
    client.hset(this.hashKey, key, JSON.stringify(result), 'EX', 10);
    return result;
  } catch (error) {
    return error;
  }
};

module.exports = {
  clearCache(hashKey) {
    client.del(JSON.stringify(hashKey));
  },
};
