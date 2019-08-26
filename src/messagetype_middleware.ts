/**
 * @module botbuilder-adapter-github
 */

import { ActivityTypes, TurnContext, MiddlewareSet } from 'botbuilder';
import { GithubAdapter } from './github_adapter';

import * as Debug from 'debug';
const debug = Debug('botkit:github-middleware');

/**
 * A middleware for Botkit developers using the BotBuilder GithubAdapter class.
 * 
 * Responsible for classifying messages:
 *
 *      * `direct_mention` events are messages that start with a mention of the bot, i.e "@mybot hello there"
 *      * `mention` events are messages that include a mention of the bot, but not at the start, i.e "hello there @mybot"
 * 
 * To use this, bind it to the adapter before creating the Botkit controller:
 * ```javascript
 * const adapter = new GithubAdapter(options);
 * adapter.use(new GithubMessageTypeMiddleware());
 * const controller = new Botkit({
 *      adapter: adapter,
 *      // ...
 * });
 * ```
 */
export class GithubMessageTypeMiddleware extends MiddlewareSet {
    /**
     * Not for direct use - implements the MiddlewareSet's required onTurn function used to process the event
     * @param context
     * @param next
     */
    public async onTurn(context: TurnContext, next: () => Promise<any>): Promise<void> {

        if (context.activity.type === ActivityTypes.Message && context.activity.channelData) {
            let adapter = context.adapter as GithubAdapter;

            const bot = await adapter.getBotUserFromAPI();
            const mentionSyntax = '@' + bot.login;
            const mention = new RegExp(mentionSyntax, 'i');
            const direct_mention = new RegExp('^' + mentionSyntax, 'i');
            const slash_command = new RegExp('^\/\w+', 'i');

            if (bot.login && context.activity.text && context.activity.text.match(direct_mention)) {
                debug('Detected as \'direct_mention\' by middleware')

                context.activity.channelData.botkitEventType = 'direct_mention';

                // strip the @mention
                context.activity.text = context.activity.text.replace(direct_mention, '')
                    .replace(/^\s+/, '').replace(/^:\s+/, '').replace(/^\s+/, '');
            } else if (bot.login && context.activity.text && context.activity.text.match(mention)) {
                debug('Detected as \'mention\' by middleware')
                context.activity.channelData.botkitEventType = 'mention';
            } else if (context.activity.text && context.activity.text.match(slash_command)) {
                debug('Detected as \'slash_command\' by middleware')

                context.activity.channelData.botkitEventType = 'slash_command';

                context.activity.type = ActivityTypes.Event;

                context.activity.text = context.activity.text.replace(/^\//, '');
            } else {
                // this is an "ambient" message
            }
        }
        await next();
    }
}