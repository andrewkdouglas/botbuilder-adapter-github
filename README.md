# botbuilder-adapter-github

Connect [Botkit](https://www.npmjs.com/package/botkit) or [BotBuilder](https://www.npmjs.com/package/botbuilder) to Github.

This package contains an adapter that communicates directly with the Github API,
and translates messages to and from a standard format used by your bot. This package can be used alongside your favorite bot development framework to build bots that work with Github.

This adapter uses patterns from [botbuilder-adapter-slack](https://github.com/howdyai/botkit/blob/master/packages/botbuilder-adapter-slack) and [botbuilder-adapter-web](https://github.com/howdyai/botkit/blob/master/packages/botbuilder-adapter-web). Thanks Slack (and Microsoft)!

## Install Package

Add this package to your project using npm:

```bash
npm install --save botbuilder-adapter-github
```

Import the adapter class into your code:

```javascript
const { GithubAdapter } = require('botbuilder-adapter-github');
```

## Get Started

If you are starting a brand new project, [follow these instructions to create a customized application template.](https://botkit.ai/getstarted.html)

## Use GithubAdapter in your App

GithubAdapter provides a translation layer for Botkit and BotBuilder so that bot developers can connect to Github, receive Web Hook messages, and have access to the Github API.

### Botkit Basics

When used in concert with Botkit, developers need only pass the configured adapter to the Botkit constructor, as seen below. Botkit will automatically create and configure the webhook endpoints and other options necessary for communicating with Github.

Developers can then bind to Botkit's event emitting system using `controller.on` and `controller.hears` to filter and handle incoming events from the messaging platform.

```javascript
const adapter = new GithubAdapter({
    webhookSecret: process.env.GITHUB_WEBHOOK_SECRET,
    githubToken: process.env.GITHUB_TOKEN
});

const controller = new Botkit({
    adapter,
    // ...other options
});

controller.on('message', async(bot, message) => {
    await bot.reply(message, 'I heard a message!');
});
```

### BotBuilder Basics

Alternately, developers may choose to use `GithubAdapter` with BotBuilder. With BotBuilder, the adapter is used more directly with a webserver, and all incoming events are handled as [Activities](https://docs.microsoft.com/en-us/javascript/api/botframework-schema/activity?view=botbuilder-ts-latest).

```javascript
const adapter = new GithubAdapter({
    webhookSecret: process.env.GITHUB_WEBHOOK_SECRET,
    githubToken: process.env.GITHUB_TOKEN
});

const server = restify.createServer();
server.use(restify.plugins.bodyParser());
server.post('/api/github', (req, res) => {
     adapter.processActivity(req, res, async(context) => {
         await context.sendActivity('I heard a message!');
     });
});
```

### Github setup

In order for Botkit to receive events from Github an outgoing webhook needs to be configured (at either the repo or organisational level). Deploy a bot, and then fetch the public URL for your bot and use this to set up a webhook in Github ([Managing Github webhooks](https://developer.github.com/webhooks/)).

Currently the following webhook events are supported:

| Event | Description
| --- | ---
| Issue comments | Issue comment created, edited, or deleted.

#### Securing your webhook endpoint
Is is strongly suggested that developers secure the Botkit endpoint using a `webhookSecret`. A unique key needs to be included as an option on initialization with the same key provided to Github when setting up any webhook ([Securing Github webooks](https://developer.github.com/webhooks/securing/)).

## Event List

This adapter will emit the following events: 

| Event | Description
|--- |---
| message | a message from a user received in an issue or pull request
| direct_message | a message from a user to the bot user received in an issue or pull request (with GithubMessageTypeMiddleware)
| slash_command | a message starting with a slash command received in an issue or pull request (with GithubMessageTypeMiddleware)
| *github_event*_*github_action* | all other events processed from github (with GithubEventTypeMiddleware)

This package includes a set of optional middleware that will modify the type of incoming events.

Most Botkit developers who plan to use features above and beyond the basic send/receive API should enable these middleware.

Import the adapter and the middlewares:

```javascript
// load GithubAdapter, GithubMessageTypeMiddleware and GithubEventTypeMiddleware
const { GithubAdapter, GithubMessageTypeMiddleware, GithubEventTypeMiddleware } = require('botbuilder-adapter-github');
```

**GithubMessageTypeMiddleware**

Create your adapter (as above), then bind the middlewares to the adapter:

```javascript
adapter.use(new GithubMessageTypeMiddleware());
```

Now, Botkit will emit activities of type 'message', 'direct_mention' and 'slash_command':

```
// @botuser Release
controller.hears('Release', ['direct_mention'], async function(bot, message) {
    await bot.reply(message, 'Lets start a release');
});
```

**GithubEventTypeMiddleware**

Create your adapter (as above), then bind the middlewares to the adapter:

```javascript
adapter.use(new GithubEventTypeMiddleware());
```

Now, Botkit will emit activities using the format '*github_event*_*github_action*:

```
// @botuser Release
controller.on('pull_request_created', async function(bot, message) {
    console.log('PR created!!');
});
```

The event types are generated using the value from the incoming 'X-GitHub-Event' header, and concatenating the payload action (with an extra underscore).

### Github event types
Currently this adapter supports all Github event types  (as defined in the header `X-GitHub-Event`). A full list of webhook events can be found here: https://developer.github.com/v3/activity/events/types/


**issue_comment events**
issue_comment are a comment submitted to an issue or pull request. These are a special case, and are mapped to messages in Botkit.


## Calling Github APIs

This package exposes a pre-configured [Github API client](https://octokit.github.io/rest.js/) for developers who want to use one of the many available API endpoints. To use the feature the option `githubToken` must be set with a valid Github API token ([Github personal access tokens](https://github.com/settings/tokens)).

In Botkit handlers, the `bot` worker object passed into all handlers will contain a `bot.api` field that contains the client, preconfigured and ready to use.

```javascript
controller.on('message', async(bot, message) {

    // retrieve a pull request
    const { data: pullRequest } = await bot.api.pulls.get({
        owner: 'octokit',
        repo: 'rest.js',
        pull_number: 123
    })

});
```

## Adapter extras 

### Update and remove messages

Where Github supports updating and deleting messages. Do so with the following convenience methods:

* bot.updateMessage()
* bot.deleteMessage()

## About Botkit

Botkit is a part of the [Microsoft Bot Framework](https://dev.botframework.com).

Botkit is released under the [MIT Open Source license](https://github.com/howdyai/botkit/blob/master/LICENSE.md)
