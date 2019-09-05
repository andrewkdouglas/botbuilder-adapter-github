/**
 * @module botbuilder-adapter-github
 */

/**
 * Written by adapting Slack's adapter: https://github.com/howdyai/botkit/blob/master/packages/botbuilder-adapter-slack
 * Any similarities are not coincidental. Thank you Slack (& Microsoft)!
 */

import { Activity, ActivityTypes, BotAdapter, TurnContext, ConversationReference, ResourceResponse, RoleTypes } from 'botbuilder';

import * as Octokit from '@octokit/rest';
import * as crypto from 'crypto';
import * as Debug from 'debug';
const debug = Debug('botkit:github');

/**
 * Connect [Botkit](https://www.npmjs.com/package/botkit) or [BotBuilder](https://www.npmjs.com/package/botbuilder) to Github.
 */
export class GithubAdapter extends BotAdapter {
    private options: GithubAdapterOptions;
    private octokit: Octokit;

    private identity: {
        user_id: string;
        login: string;
    };

    /**
     * Name used by Botkit plugin loader
     * @ignore
     */
    public name: string = 'Github Adapter';

    /**
     * Object containing one or more Botkit middlewares to bind automatically.
     * @ignore
     */
    public middlewares;

    /**
     * Create a Github adapter.
     *
     *
     * Use with Botkit:
     *```javascript
     * const adapter = new GithubAdapter({
     *      webhookSecret: process.env.GITHUB_WEBHOOK_SECRET,
     *      githubToken: process.env.GITHUB_TOKEN
     * });
     * const controller = new Botkit({
     *      adapter: adapter,
     *      // ... other configuration options
     * });
     * ```
     *
     * Use with BotBuilder:
     *```javascript
     * const adapter = new GithubAdapter({
     *      webhookSecret: process.env.GITHUB_WEBHOOK_SECRET,
     *      githubToken: process.env.GITHUB_TOKEN
     * });
     * // set up restify...
     * const server = restify.createServer();
     * server.use(restify.plugins.bodyParser());
     * server.post('/api/github', (req, res) => {
     *      adapter.processActivity(req, res, async(context) => {
     *          // do your bot logic here!
     *      });
     * });
     * ```
     *
     * @param options An object containing API credentials, webhook verification secret and other options
     */
    public constructor(options: GithubAdapterOptions) {
        super();

        debug('Loading GithubAdapter')

        this.options = options;

        /*
        * Check for security options. If these are not set, malicious actors can
        * spoof messages from Github.
        * These will be required in upcoming versions of Botkit.
        */
        if (!this.options.webhookSecret) {
            const warning = [
                ``,
                `****************************************************************************************`,
                `* WARNING: Your bot is operating without recommended security mechanisms in place.     *`,
                `* Initialize your adapter with a webhookSecret parameter to enable                     *`,
                `* verification that all incoming webhooks originate with Github:                       *`,
                `*                                                                                      *`,
                `* var adapter = new GithubAdapter({webhookSecret: <my secret from github>});           *`,
                `*                                                                                      *`,
                `****************************************************************************************`,
                `>> GitHub docs: https://developer.github.com/webhooks/securing/`,
                ``
            ];
            console.warn(warning.join('\n'));
        }

        if(!this.options.githubToken){
            const warning = [
                ``,
                `****************************************************************************************`,
                `* WARNING: Your bot is operating without a Github API token.                           *`,
                `* Initialize your adapter with a githubToken parameter to enable API access to         *`,
                `* Github                                                                               *`,
                `*                                                                                      *`,
                `* var adapter = new GithubAdapter({githubToken: <my token from github>});              *`,
                `*                                                                                      *`,
                `****************************************************************************************`,
                `>> Github docs: https://github.com/settings/tokens`,
                ``
            ];
            console.warn(warning.join('\n'));
        }

        this.middlewares = {
            spawn: [
                async (bot, next) => {
                    // make Github API available to all bot instances.
                    bot.api = await this.getAPI().catch((err) => {
                        debug('An error occurred while trying to get API creds for Github', err);
                        return next(new Error('Could not spawn a Github API instance'));
                    });

                    next();
                }
            ]
        };
    }

    /**
     * Get a Github API client
     * This is used by many internal functions to get access to the Github API, and is exposed as `bot.api` on any bot worker instances.
     */
    public async getAPI(): Promise<Octokit> {
        if (this.octokit) {
            return this.octokit;
        } else {
            const token = this.options.githubToken;
            if (!token) {
                throw new Error('Missing api token.');
            }
            return new Octokit({
                auth: token,
                userAgent: 'Botkit'
            });
        }
    }

    /**
     * Get the bot user id associated with the current Github API token. This is used internally by the GithubMessageTypeMiddleware to 
     * identify mention events and processActivity().
     */
    public async getBotUserFromAPI(): Promise<{ user_id: string; login: string; }> {
        if (!this.identity) {
            const octokit = await this.getAPI();
            const user = await octokit.users.getAuthenticated();
            
            if(!user || !user.data || !user.data.login){
                throw new Error('Not authenticated');
            }

            debug('Logged in as Github user:',user.data.login);

            this.identity = { user_id: user.data.id, login: user.data.login }
        }
        return this.identity;
    }

    
    /**
     * Formats a BotBuilder activity into an outgoing Github message.
     * @param activity A BotBuilder Activity object
     * @returns a Github message object with {text, target}
     */
    public activityToGithub(activity: Partial<Activity>): GithubMessage {
        
        let message: any = {activityId: activity.id}

        if(activity.conversation){
            // @ts-ignore ignore this non-standard field
            let repoParts = activity.conversation.repo.split('/');

            message.target = {
                type: activity.conversation.conversationType,
                id: activity.conversation.id,
                owner: repoParts[0],
                repo: repoParts[1]
            };
        }

        if(activity.text){
            message.text = activity.text;
        }

        return message;
    }

    /**
     * Standard BotBuilder adapter method to send a message from the bot to the Github API.
     * [BotBuilder reference docs](https://docs.microsoft.com/en-us/javascript/api/botbuilder-core/botadapter?view=botbuilder-ts-latest#sendactivities).
     * @param context A TurnContext representing the current incoming message and environment.
     * @param activities An array of outgoing activities to be sent back to the messaging API.
     */
    public async sendActivities(context: TurnContext, activities: Partial<Activity>[]): Promise<ResourceResponse[]> {
        const responses = [];
        for (var a = 0; a < activities.length; a++) {
            const activity = activities[a];
            if (activity.type === ActivityTypes.Message) {
                const message = this.activityToGithub(activity as Activity);

                try {
                    const octokit = await this.getAPI();
                    let result = null;

                    switch (message.target.type) {
                        case 'issue_comment':
                        case 'pull_request':
                        case 'issues':
                            result = await octokit.issues.createComment({
                                owner: message.target.owner,
                                repo: message.target.repo,
                                issue_number: message.target.id,
                                body: message.text
                            })
                            break;
                        default:
                            result = 'Unsupported target type [' + message.target.type + '] (must be one of [issue_comment,issues,pull_request])'
                    }

                    if (result.status < 300) {
                        responses.push({
                            id: result.data.id,
                            activityId: activity.id,
                            conversation: activity.conversation
                        });
                    } else {
                        console.error('Error sending activity to API:', result);
                    }
                } catch (err) {
                    console.error('Error sending activity to API:', err);
                }
            } else {
                // If there are ever any non-message type events that need to be sent, do it here.
                debug('Unknown message type encountered in sendActivities: ', activity.type);
            }
        }

        return responses;
    }

    /**
     * Standard BotBuilder adapter method to update a previous message with new content.
     * [BotBuilder reference docs](https://docs.microsoft.com/en-us/javascript/api/botbuilder-core/botadapter?view=botbuilder-ts-latest#updateactivity).
     * @param context A TurnContext representing the current incoming message and environment.
     * @param activity The updated activity in the form `{id: <id of activity to update>, ...}`
     */
    public async updateActivity(context: TurnContext, activity: Partial<Activity>): Promise<void> {
        if (activity.id && activity.conversation) {
            try {
                const message = this.activityToGithub(activity as Activity);
                const octokit = await this.getAPI();

                let result = null;

                switch (message.target.type) {
                    case 'issue_comment':
                        result = await octokit.issues.updateComment({
                            owner: message.target.owner,
                            repo: message.target.repo,
                            comment_id: message.activityId,
                            body: message.text
                        })
                        console.log(result)
                        break;
                    default:
                        result = 'Unsupported target type (must be one of [issue_comment])'
                }

                if (!(result.status < 300 )) {
                    console.error('Error updating activity on Github:', result);
                }
            } catch (err) {
                console.error('Error updating activity on Github:', err);
            }
        } else {
            throw new Error('Cannot update activity: activity is missing id');
        }
    }

    /**
     * Standard BotBuilder adapter method to delete a previous message.
     * [BotBuilder reference docs](https://docs.microsoft.com/en-us/javascript/api/botbuilder-core/botadapter?view=botbuilder-ts-latest#deleteactivity).
     * @param context A TurnContext representing the current incoming message and environment.
     * @param reference An object in the form `{activityId: <id of message to delete>, conversation: { <details of conversation> }}`
     */
    public async deleteActivity(context: TurnContext, reference: Partial<ConversationReference>): Promise<void> {
        if (reference.activityId && reference.conversation) {
            try {
                const octokit = await this.getAPI();
                const message = this.activityToGithub(context.activity as Activity);

                let result = null;

                switch (message.target.type) {
                    case 'issue_comment':
                        result = octokit.issues.deleteComment({
                            owner: message.target.owner,
                            repo: message.target.repo,
                            comment_id: message.activityId
                        })
                        console.log(result)
                        break;
                    default:
                        result = 'Unsupported target type (must be one of [issue_comment])'
                }
                if (!(result.status < 300 )) {
                    console.error('Error deleting activity:', result);
                }
            } catch (err) {
                console.error('Error deleting activity', err);
                throw err;
            }
        } else {
            throw new Error('Cannot delete activity: reference is missing activityId');
        }
    }

    /**
     * Standard BotBuilder adapter method for continuing an existing conversation based on a conversation reference.
     * [BotBuilder reference docs](https://docs.microsoft.com/en-us/javascript/api/botbuilder-core/botadapter?view=botbuilder-ts-latest#continueconversation)
     * @param reference A conversation reference to be applied to future messages.
     * @param logic A bot logic function that will perform continuing action in the form `async(context) => { ... }`
     */
    public async continueConversation(reference: Partial<ConversationReference>, logic: (context: TurnContext) => Promise<void>): Promise<void> {
        throw new Error('Not currently supported (continueConversation)');
    }

    /**
     * Verify the signature of an incoming webhook request as originating from Github.
     * @param req A request object from Restify or Express
     * @param res A response object from Restify or Express
     * @returns If signature is valid, returns true. Otherwise, sends a 401 error status via http response and then returns false.
     */
    private async verifySignature(req, res): Promise<boolean> {
        if (this.options.webhookSecret && req.rawBody) {

            debug('Verifying message signature');

            let messageHash = req.header('X-Hub-Signature');
            let body = req.rawBody;

            let basestring = body;

            const hash = 'sha1=' + crypto.createHmac('sha1', this.options.webhookSecret)
                .update(basestring)
                .digest('hex');

            // Compare the hash of the computed signature with the retrieved signature with a secure hmac compare function
            const validSignature = (): boolean => {

                const githubSigBuffer = Buffer.from(messageHash);
                const compSigBuffer = Buffer.from(hash);

                return crypto.timingSafeEqual(githubSigBuffer, compSigBuffer);
            };

            // replace direct compare with the hmac result
            if (!validSignature()) {
                debug('Signature verification failed, Ignoring message');
                res.status(401);
                return false;
            }
            else {
                debug('Signature verification passed');
            }
        }

        return true;
    }

    /**
     * Accept an incoming webhook request and convert it into a TurnContext which can be processed by the bot's logic.
     * @param req A request object from Restify or Express
     * @param res A response object from Restify or Express
     * @param logic A bot logic function in the form `async(context) => { ... }`
     */
    public async processActivity(req, res, logic: (context: TurnContext) => Promise<void>): Promise<void> {
        // Create an Activity based on the incoming message from Github.
        // There are a few different types of event that Github might send.
        let event = req.body;

        debug('Processing incoming request')

        if (!await this.verifySignature(req, res)) {
            // Signature verification failed
            return;
        }


        const eventType = req.header('X-Github-Event');

        let activity = {};

        let context = null;


        const user = await this.getBotUserFromAPI();

        switch (eventType) {
            case 'issue_comment':

                debug('Received a message: ' + eventType);             

                if(user.user_id == event.comment.user.id){
                    debug('Ignoring message from bot user (' + event.comment.user.login + ')');
                    return;
                }

                activity = {
                    type: ActivityTypes.Message,
                    id: event.comment.id,
                    timestamp: new Date(event.comment.updated_at),
                    channelData: event,
                    channelId: 'github',
                    from: {
                        id: event.comment.user.login,
                        role: event.comment.user.type == 'User' ? RoleTypes.User : RoleTypes.Bot
                    },
                    conversation:{
                        isGroup: true,
                        conversationType: eventType,
                        id: event.issue.number,
                        repo: event.repository.full_name
                    },
                    recipient:{
                        id: user.login,
                        role: RoleTypes.Bot
                    },
                    text: event.comment.body,
                    label: eventType                    
                };

                // create a conversation reference
                // @ts-ignore
                context = new TurnContext(this, activity as Activity);

                context.turnState.set('httpStatus', 200);

                await this.runMiddleware(context, logic);

                break;
            default:

                debug('Received an event: ' + eventType);

                activity = {
                    type: ActivityTypes.Event,
                    id: event.repository.full_name,
                    timestamp: new Date(),
                    channelData: event,
                    channelId: 'github',
                    from: {
                        id: event.sender.login,
                        role: event.sender.type == 'User' ? RoleTypes.User : RoleTypes.Bot
                    },   
                    conversation: {
                        id: req.header('X-Github-Delivery')
                    },
                    recipient: { id: null },
                    text: null,
                    label: eventType                    
                };

                // create a conversation reference
                // @ts-ignore
                context = new TurnContext(this, activity as Activity);

                context.turnState.set('httpStatus', 200);

                await this.runMiddleware(context, logic);

                break;

        }

        // send http response back
        res.status(context ? context.turnState.get('httpStatus') : 200);
        if (context && context.turnState.get('httpBody')) {
            res.send(context.turnState.get('httpBody'));
        } else {
            res.end();
        }
    }
}

/**
 * This interface defines the options that can be passed into the GithubAdapter constructor function.
 */
export interface GithubAdapterOptions {
    /**
     * Secret used for validating the origin of incoming webhook messages
     */
    webhookSecret?: string;
    /**
     * A token to access Github API
     */
    githubToken?: string;
};


/**
 * Interface to define a message to be sent to Github
 */
export interface GithubMessage {
    /**
     * ID of the current activity
     */
    activityId?: number;
    /**
     * A Github target
     */
    target: GithubTarget;
    /**
     * Text to send as a message to Github
     */
    text ?: string;
}

/**
 * Interface to define a Github target (owner + repo + id of record/object)
 */
export interface GithubTarget {
    /**
     * Target type - can be one of {issue_comment}
     */
    type: string;
    /**
     * ID of the target - for example; Issue ID 
     */
    id: number;
    /**
     * Repo owner
     */
    owner: string;
    /**
     * Repo name
     */
    repo: string;
}
