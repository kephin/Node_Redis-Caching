# :rocket: Enhance Node Application

## :gift: Data Caching with Redis

Caching is a very easy way to dramatically improve the **READ** performance of an express application.

| # | Topics |
|---|--------|
| 1.|[MongoDB Query Performance](#seedling-mongodb-query-performance)|
| 2.|[Query Caching Layer](#tada-query-caching-layer)|
| 3.|[Set up Redis and basic operations](#arrow_down-set-up-redis-and-basic-operations)|
| 4.|[Caching in Action](#zap-caching-in-action)|
| 5.|[Three Big Issues](#exclamation-three-big-issues)|
| 6.|[Patch Mongoose's Exec for the first 2 issues](#electric_plug-patch-mongooses-exec-for-the-first-2-issues)|
| 7.|[Toggleable Cache](#feet-toggleable-cache)|
| 8.|[Cache Expiration](#shower-cache-expiration)|

### :seedling: MongoDB Query Performance

:thumbsup: What's good!

Whenever we send out a mongoDB query to our mongoDB database, the query is then sent to index. MongoDB has **index** internally to match up with all the individual collection. This **index** is an efficient data structure for looking up sets of records inside the collection.

**Indices** are efficient because they allow us to directly go to the record that we're looking for, instead of having to look at every single record inside the collection to figure out which one we're trying to find.

**indices** are what makes mongoDB very fast!

:thumbsdown: What's the issues!

However, there is something need to be aware of! Whenever an index is created for a mongo collection, the index targets in individual property that exists on these records.

For example, we store blog post inside our mongoDB. Every blog post that we create has three different properties tied to it, which are:

```javascript
{
  _id: 'wioeru23489wjoweruowru983',
  title: 'First blog',
  content: 'Hello world, javascript rocks!!',
}
```

So because we have **index** for specially the **_id** property, that means if we ever ask mongoDB to give us a blog with a particular **_id**, this **index** can very quickly go and find the correct blog post. The time complexity will be O(1).

:exclamation: But what happen if we issue a query where we ask for a blog post with a very specific **title**? Well, if an **index** for the title property does not exist, we cannot enjoy any fast look up for data inside our collection. So mongoDB will fall back to its default behavior, where time complexity will be O(n).

:point_right: Conclusion

When we make a query over to mongoDB, if we have an **index** ready, the query will be executed very fast. However we can very easily write queries that don't match up with an **index** or don't have an **index** available. In those situations we would run into big performance concerns around our application.

:bulb: Solution: Add in an index for that given field

We can have **multiple indices** for our collection. For example, we can have one index for **_id** property and another one for **title** property as well.

:exclamation: However, when we add **indices** to a collection, that has an impact on our ability to **POST** to that collection.

In addition, anytime we add in more indices, that will consume more disk space and more memory as well.

Finally, we might be making queries inside of an application where we can't really figure out ahead of time what indices we need for it.

So this is not a good solution.

### :tada: Query Caching Layer

:computer: Setup a cache server

Anytime Mongoose issues a query, it goes to **cache server** first, instead of mongoDB server directly. The cache server will check to see if that exact query has every been issued before.

If not, then cache server will send the query to mongoDB, and store the result of that query on itself. So it's going to maintain a record between queries that are issued and response that comes back.

Finally, the cache layer is not used for any **POST** actions. It's only used for **GET** data. Anytime we write some data, we clear any data stored on the cache server that is related to the record that we just wrote or updated.

### :arrow_down: Set up Redis and basic operations

Installation and Basic operations

```shell
$ brew install redis
$ brew services start redis
$ redis-cli ping  # should return PONG
```

```javascript
const redis = require('redis');

// promisify the callback function
const { promisify } = require('util');
client.get = promisify(client.get);

const redisUrl = 'redis:127.0.0.1:6379';
const client = redis.createClient(redisUrl);
client.set('hi', 'there');
const data = await client.get('hi');

// if you want to store an object, remember to stringify it
const blog = { _id: 'lsdfjl23j4h13', title: 'first', content: 'hello world' };
client.set(blog._id, JSON.stringify(blog));
const dataString = client.get('lsdfjl23j4h13');
const dataObject = JSON.parse(dataString);

// nested data structure
client.hset('spanish', 'red', 'rojo');
client.hget('spanish', 'red', (err, data) => console.log(data));

// drop all data inside Redis
client.flushall();
```

To implement a `Query Cache Layer`

```javascript
// imagine inside Redis
{
  query1: result of query
  query2: result of query
  query3: result of query
}
```

> We want query keys that are **consistent** but **unique** between query executions

### :zap: Caching in Action

```javascript
  app.get('/api/blogs', requireLogin, async (req, res) => {
    // Redis setup
    const redis = require('redis');
    const redisUrl = 'redis://127.0.0.1:6379';
    const client = redis.createClient(redisUrl);
    const { promisify } = require('util');
    client.get = promisify(client.get);

    // Do we have any cached data in redis related to this query?
    const cachedBlogs = await client.get(req.user.id);
    // if yes
    if (cachedBlogs) {
      console.log('Serving from cache');
      return res.send(JSON.parse(cachedBlogs));
    }
    // if no, go to mongoDB
    const blogs = await Blog.find({ _user: req.user.id });
    // remember to update our cache to store the data
    client.set(req.user.id, JSON.stringify(blogs));
    console.log('Serving from MongoDB');
    return res.send(blogs);
  });
```

### :exclamation: Three Big Issues

| #  | Problems | Solution |
| -- | -------- | -------- |
| 1. | Caching code is not reusable in our codebase | Hook into Mongoose's query generation and execution process |
| 2. | Cached keys won't work when introducing other collections or query options | Figure out a more robust solution for generating caches keys |
| 3. | Cache value doesn't get updated | Add timeout to values assigned to Redis. Also add ability to reset all values tied to some specific event |

For the 1st problem, we need to figure out a way to hook into how Mongoose makes a query and executes it against mongoDB.

Our entire caching strategy is based on the idea of stopping Mongoose from making a query to MongoDB. Also we're going to intercepting the value coming from MongoDB as well so we can store inside our cached server.

So this entire idea of caching is tightly coupled with Mongoose and when a query is executed.

:eyes: So first we need to know how queries inside of Mongoose works:

```javascript
// formulating the query
const query = Person
  .find({ occupation: /host/ })
  .where('namelast')equals('Ghost')
  .where('age')gt(17)lt(66)
  .where('likes')in(['vaporizing', 'talking'])
  .limit(10)
  .sort('-occupation')
  .select('name occupation')

// ============================================================================
// This is the timing to check if this query has already been fetched in Redis!
// ============================================================================

// actually executing
query.exec(callback);
// same as ...
query.then(result => console.log(result));
// same as ...
const result = await query;
```

:bulb: We can override the built-in exec function to do the cache check before executing the querying.

```javascript
query.exec = async function(...params) {
  // check to see if this query has already been executed
  // if it has, return the result right away
  const cache = await client.get('query key');
  if (cache) return JSON.parse(cache);

  // otherwise, issue the query *as normal*
  const result = await this.exec.apply(this, params)
  // then save the value to Redis
  client.set('query key', JSON.stringify(result));
  return result;
}
```

For the 2nd problem, we definitely need a way to not only customize the cache key base on multiple query options that we pass in, but also need to customize it based on the collection that we are trying to make the query.

:bulb: Customized query key containing query options and collection

We can call the function `getQuery()`. This will return an object containing all of the different options that we've chained onto this query.

So We could use this big customized option object as the unique query key for Redis.

```javascript
const query = Person
  .find({ occupation: /host/ })
  .where('namelast')equals('Ghost')
  .where('age')gt(17)lt(66)
  .where('likes')in(['vaporizing', 'talking'])
  .limit(10)
  .sort('-occupation')
  .select('name occupation')

console.log(query.getQuery());
```

### :electric_plug: Patch Mongoose's Exec for the first 2 issues

Put our mongoose.exec patch inside the **services** folder. The idea behind the services folder is to locate in one location, any code that touches many different parts of our project.

:exclamation: Be Careful!

Every time we try to patch an existing function inside of a library, we have to be very cognizant of **what value we're returning**. Cause we don't know how the library is attempting to use that function to itself.

When we call `exec` function, Mongoose expects that we're going to return a promise that eventually resolves **mongoose documents**, or what we refer to as a **model instance**.

So instead of returning a plain object, we need to create a model instance by `new this.model()` and return.

```javascript
Query.prototype.exec = async function overrideExec(...params) {
  const doc = { _id: '412j3l1k24jl12', content: 'hello world' };
  new this.model(doc);
  // is the same as
  new Blog(doc);
};
```

:ok_woman: Finally:

```javascript
// services/cache.js
const { Query } = require('mongoose');
const redis = require('redis');
const { promisify } = require('util');

const redisUrl = 'redis://127.0.0.1:6379';
const client = redis.createClient(redisUrl);
client.get = promisify(client.get);

const { exec } = Query.prototype;

Query.prototype.exec = async function overrideExec(...params) {
  const key = JSON.stringify({
    ...this.getQuery(),
    collection: this.mongooseCollection.name,
  });

  try {
    // see if we have value for 'key' in redis
    const cacheValue = await client.get(key);

    // if we do, return the value
    if (cacheValue) {
      const cacheObject = JSON.parse(cacheValue);

      return Array.isArray(cacheObject)
        ? cacheObject.map(doc => new this.model(doc))
        : new this.model(cacheObject);
    }

    // otherwise, issue the query and store the result in redis
    const result = await exec.apply(this, params);
    client.set(key, JSON.stringify(result));
    return result;
  } catch (error) {
    return error;
  }
};
```

### :feet: Toggleable Cache

Currently, every query is being cached, which we may not want to do that because Redis storage is generally pretty expensive.

So if we have an application where we know that we have to be doing a lot of queries that returns a lot of information, we might want to make sure that those are not cached.

To be able to create a toggleable cache, we should create a function that is tied to every query.

```javascript
Query.prototype.cache = function cache() {
  // set flag to true
  this.useCache = true;

  // to be able to tack .cache() on as a chainable property
  return this;
};

Query.prototype.exec = async function overrideExec(...params) {
  if (!this.useCache) return exec.apply(this, params);

  // ...
};
```

### :shower: Cache Expiration

- Automatically cache expiration

  ```javascript
  Query.prototype.exec = async function overrideExec(...params) {
    // ...
    client.set(key, JSON.stringify(result), 'EX', 10);
  };
  ```

- Programmatically or forced cache expiration

  > Be aware! Caching strategy from project to project is going to change slightly

  First, we need to reimplement our cache storage schema. Rather than implementing a flat data store, where a simple key-value pairs, we should instead store data in separate nested hashes. By doing that, we can use user **_id** as our top level hash keys that would allow us to better organize information stored inside Redis.

  <table style='text-align: center'>
    <tr style='font-weight: bold'>
      <td rowspan='2'>key</td>
      <td colspan='2'>value</td>
    </tr>
    <tr style='font-weight: bold'>
      <td>nested key</td>
      <td>nested value</td>
    </tr>
    <tr>
      <td rowspan='2'>userId -> 1</td>
      <td>{ _id: 1, collection: 'blogs'}</td>
      <td>result of query</td>
    </tr>
    <tr>
      <td>{ _id: 1, collection: 'comments'}</td>
      <td>result of query</td>
    </tr>
    <tr>
      <td>userId -> 2</td>
      <td>{ _id: 2, collection: 'comments'}</td>
      <td>result of query</td>
    </tr>
  </table>

  So now anytime an user create a blog post, we can very easily look at all the keys that are associated with the user, and then blow away all the nested values under this user.

  :exclamation: This is a solution that really just works on this specific case. If we imagine a scenario that user_1 can also create a blog posts that are visible to user_2. Then this schema doesn't work anymore.

  > We conclude that as soon as there is more dependencies between data, the strategy will be more complicated.

  Implement **nested hash** cache schema:

  ```javascript
  // services/cache.js
  client.hget = promisify(client.hget);

  // allow us to dynamically specify the top level key
  // we can assign any field to be as the hash key
  Query.prototype.cache = function cache(options = {}) {
    this.useCache = true;
    // add top level hash key
    this.hashKey = JSON.stringify(options.key || '');

    return this;
  };

  Query.prototype.exec = async function overrideExec(...params) {
    // replace all get() / set() by hget() / hset() and provide this.hashKey
    const cacheValue = await client.hget(this.hashKey, key);
    client.hset(this.hashKey, key, JSON.stringify(result), 'EX', 10);
  })

  // blogRoutes.js
  app.get('/api/blogs', requireLogin, async (req, res) => {
    const blogs = await Blog
      .find({ _user: req.user.id })
      // provide user.id as the top level hash key in Redis
      .cache({ key: req.user.id });

    res.send(blogs);
  });
  
  ```

  Implement the logic to actually remove the data that sits on specific hash key

  ```javascript
  // services/cache.js
  module.exports = {
    clearCache(hashKey) {
      client.del(JSON.stringify(hashKey));
    },
  };

  // blogRoutes.js
  const { clearCache } = require('../services/cache');

  app.post('/api/blogs', requireLogin, async (req, res) => {
    // ...
    // After posting a new blog
    clearCache(req.user.id);
  });
  ```

  :bulb: Final solution: make `clearCache()` a after hook middleware

  ```javascript
  // middlewares/clearCache.js
  const { clearCache } = require('../services/cache');

  module.exports = {
    async clearCacheByUserId(req, res, next) {
      const afterResponse = () => {
        res.removeListener('finish', afterResponse);

        if (res.statusCode < 400) clearCache(req.user.id);
      };

      res.on('finish', afterResponse);
      next();
    },
  };

  // blogRoutes.js
  const { clearCacheByUserId } = require('../middlewares/clearCache');

  app.post('/api/blogs', requireLogin, clearCacheByUserId, async (req, res) => {
    // ...
  });
  ```
