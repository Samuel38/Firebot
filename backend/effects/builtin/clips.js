"use strict";

const clipProcessor = require("../../common/handlers/createClipProcessor");

const { ControlKind, InputEvent } = require('../../interactive/constants/MixplayConstants');
const effectModels = require("../models/effectModels");
const { EffectDependency, EffectTrigger } = effectModels;

const accountAccess = require("../../common/account-access");
const streamerAccount = accountAccess.getAccounts().streamer;

const discord = require("../../integrations/builtin/discord/discord-message-sender");

const { EffectCategory } = require('../../../shared/effect-constants');

/**
 * The Clip effect
 */
const clip = {
    /**
   * The definition of the Effect
   */
    definition: {
        id: "firebot:clip",
        name: "Create Clip",
        description: "Creates a clip on Mixer.",
        hidden: !streamerAccount.loggedIn || !streamerAccount.canClip,
        icon: "fad fa-film",
        categories: [EffectCategory.COMMON, EffectCategory.FUN],
        dependencies: [EffectDependency.CHAT],
        triggers: effectModels.buildEffectTriggersObject(
            [ControlKind.BUTTON],
            [InputEvent.MOUSEDOWN, InputEvent.KEYDOWN],
            EffectTrigger.ALL
        )
    },
    /**
   * Global settings that will be available in the Settings tab
   */
    globalSettings: {},
    /**
   * The HTML template for the Options view (ie options when effect is added to something such as a button.
   * You can alternatively supply a url to a html file via optionTemplateUrl
   */
    optionsTemplate: `
        <eos-container header="Clip Duration" pad-top="true">
            <p>The duration of the clip in seconds (default 30s, min 5s, max 300s)</p>
            <input ng-model="effect.clipDuration" type="text" class="form-control" placeholder="Enter duration" replace-variables="number">
            <p ng-show="trigger == 'command'" class="muted" style="font-size:12px;margin-top:6px;"><b>ProTip:</b> Use <b>$ensureNumber[$arg, 30]</b> to allow viewers to specify a clip duration but default to 30 if they don't provide one. Example: !clip 60</p>
        </eos-container>

        <eos-container>
            <div style="padding-top:15px">
                <label class="control-fb control--checkbox"> Post clip link in chat
                    <input type="checkbox" ng-model="effect.postLink">
                    <div class="control__indicator"></div>
                </label>
            </div>

            <div style="padding-top:15px" ng-show="hasChannels">
                <label class="control-fb control--checkbox"> Post clip in Discord channel
                    <input type="checkbox" ng-model="effect.postInDiscord">
                    <div class="control__indicator"></div>
                </label>
            </div>

            <div ng-show="effect.postInDiscord" style="margin-left: 30px;">
                <div>Discord Channel:</div>
                <dropdown-select options="channelOptions" selected="effect.discordChannelId"></dropdown-select>
            </div>

            <div style="padding-top:20px">
                <label class="control-fb control--checkbox"> Download clip <tooltip text="'You can change which folder clips save to in the Settings tab.'"></tooltip>
                    <input type="checkbox" ng-model="effect.download">
                    <div class="control__indicator"></div>
                </label>
            </div>
        </eos-container>

        <eos-container>
            <div class="effect-info alert alert-warning">
                Note: You must be live for this effect to work.
            </div>
        </eos-container>
    `,
    /**
   * The controller for the front end Options
   */
    optionsController: ($scope, $q, backendCommunicator) => {
        if ($scope.effect.clipDuration == null) {
            $scope.effect.clipDuration = 30;
        }

        $scope.hasChannels = false;
        $scope.channelOptions = {};
        $q.when(backendCommunicator.fireEventAsync("getDiscordChannels"))
            .then(channels => {
                if (channels && channels.length > 0) {
                    const newChannels = {};

                    for (const channel of channels) {
                        newChannels[channel.id] = channel.name;
                    }

                    if ($scope.effect.channelId == null ||
                        newChannels[$scope.effect.channelId] == null) {
                        $scope.effect.channelId = channels[0].id;
                    }

                    $scope.channelOptions = newChannels;

                    $scope.hasChannels = true;
                }
            });
    },
    /**
   * When the effect is triggered by something
   */
    optionsValidator: effect => {
        let errors = [];
        if (effect.postInDiscord && effect.discordChannelId == null) {
            errors.push("Please select Discord channel.");
        }
        return errors;
    },
    /**
   * When the effect is triggered by something
   */
    onTriggerEvent: async event => {
        return await clipProcessor.createClip(event.effect, event.trigger);
    }
};

module.exports = clip;
