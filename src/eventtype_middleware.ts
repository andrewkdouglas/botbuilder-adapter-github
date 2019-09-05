/**
 * @module botbuilder-adapter-github
 */

import { ActivityTypes, TurnContext, MiddlewareSet } from 'botbuilder';

import * as Debug from 'debug';
const debug = Debug('botkit:eventtype-middleware');

/**
 * A middleware for Botkit developers using the BotBuilder GithubAdapter class.
 * 
 * Classifies events by either just using the GitHub event type (taken from the
 * X-Github-Event header), or by using the GitHub event type + '_' + the action
 * provided in the event body.
 * 
 * 
 * To use this, bind it to the adapter before creating the Botkit controller:
 * ```javascript
 * const adapter = new GithubAdapter(options);
 * adapter.use(new GithubEventMiddleware());
 * const controller = new Botkit({
 *      adapter: adapter,
 *      // ...
 * });
 * ```
 */
export class GithubEventTypeMiddleware extends MiddlewareSet {
    /**
     * Not for direct use - implements the MiddlewareSet's required onTurn function used to process the event
     * @param context
     * @param next
     */
    public async onTurn(context: any, next: () => Promise<any>): Promise<void> {

        if (context.activity.type === ActivityTypes.Event && context.activity.label && context.activity.channelData && context.activity.channelData.botkitEventType != 'slash_command') {

            let eventType = context.activity.label;
            
            if(context.activity.channelData.action){
                context.activity.channelData.botkitEventType = eventType + '_' + context.activity.channelData.action;
            }
            else{
                context.activity.channelData.botkitEventType = eventType;
            }

            // Add conversation details where possible
            if(eventType == 'pull_request'){
                // Add details to allow us to reply back into the PR
                context.activity.conversation.isGroup = true;
                context.activity.conversation.conversationType = eventType;
                context.activity.conversation.id = context.activity.channelData.number;
                context.activity.conversation.repo = context.activity.channelData.repository.full_name;
            }
            else if(eventType == 'issues'){
                // Add details to allow us to reply back into the Issue
                context.activity.conversation.isGroup = true;
                context.activity.conversation.conversationType = eventType;
                context.activity.conversation.id = context.activity.channelData.issue.number;
                context.activity.conversation.repo = context.activity.channelData.repository.full_name;
            }

            debug('Event type: ' + context.activity.channelData.botkitEventType);
            
        }
        await next();
    }
}