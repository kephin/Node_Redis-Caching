# :rocket: Enhance Node Application

## :gift: Data Caching with Redis

Caching is a very easy way to dramatically improve the `READ` performance of an express application.

### :seedling: MongoDB Query Performance

:thumbsup: What's good!

Whenever we send out a mongoDB query to our mongoDB database, the query is then sent to index. MongoDB has `index` internally to match up with all the individual collection. This `index` is an efficient data structure for looking up sets of records inside the collection.

`Indices` are efficient because they allow us to directly go to the record that we're looking for, instead of having to look at every single record inside the collection to figure out which one we're trying to find.

`indices` are what makes mongoDB very fast!

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

So because we have `index` for specially the `_id` property, that means if we ever ask mongoDB to give us a blog with a particular `_id`, this `index` can very quickly go and find the correct blog post. The time complexity will be O(1).

:exclamation: But what happen if we issue a query where we ask for a blog post with a very specific `title`? Well, if an `index` for the title property does not exist, we cannot enjoy any fast look up for data inside our collection. So mongoDB will fall back to its default behavior, where time complexity will be O(n).

:point_right: Conclusion

When we make a query over to mongoDB, if we have an `index` ready, the query will be executed very fast. However we can very easily write queries that dont' match up with an `index` or dont' have an `index` available. In those situations we would run into big performance concerns around our application.

:bulb: Solution: Add in an index for that given field

We can have `multiple indices` for our collection. For example, we can have one index for `_id` property and another one for `title` property as well.

:exclamation: However, when we add `indices` to a collection, that has an impact on our ability to `write` to that collection.

In addition, anytime we add in more indices, that will consume more disk space and more memory as well.

Finally, we might be making queries inside of an application where we can't really figure out ahead of time what indices we need for it.

So this is not a good solution.
