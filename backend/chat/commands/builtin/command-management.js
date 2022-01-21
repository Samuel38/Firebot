"use strict";

const SystemCommand = require("../system-command");
const uuidv1 = require("uuid/v1");
const util = require("../../../utility");

const seperateTriggerFromArgs = (args) => {
    let trigger, remainingData = "";
    if (args[1].startsWith("\"")) {
        const combined = args.slice(1).join(" ");
        const quotedTriggerRegex = /(?<=(?:\s|^)")(?:[^"]|(?:\\"))*(?=(?:(?:"(?<!\\"))(?:\s|$)))/i;
        const results = quotedTriggerRegex.exec(combined);

        if (results === null) {
            trigger = args[1];
            remainingData = args.slice(2).join(" ").trim();
        } else {
            trigger = results[0].trim();
            remainingData = combined.replace(`"${trigger}"`, "").trim();
        }
    } else {
        trigger = args[1];
        remainingData = args.slice(2).join(" ").trim();
    }
    return {
        trigger: trigger,
        remainingData: remainingData
    };
};

const mapPermArgToRoleIds = (permArg) => {
    if (permArg == null || permArg === "") {
        return [];
    }

    const normalizedPerm = permArg.toLowerCase().trim(),
        groups = [];

    switch (normalizedPerm) {
    case "all":
    case "everyone":
        break;
    case "sub":
        groups.push("sub");
        break;
    case "vip":
        groups.push("vip");
        break;
    case "mod":
        groups.push("mod");
        break;
    case "streamer":
        groups.push("broadcaster");
        break;
    }

    return groups;
};

class CommandManagement extends SystemCommand {
    constructor() {
        super({
            id: "firebot:commandmanagement",
            name: "Command Management",
            type: "system",
            active: true,
            trigger: "!command",
            description: "Allows custom command management via chat.",
            autoDeleteTrigger: false,
            scanWholeMessage: false,
            hidden: false,
            cooldown: {
                user: 0,
                global: 0
            },
            restrictionData: {
                restrictions: [
                    {
                        id: "sys-cmd-mods-only-perms",
                        type: "firebot:permissions",
                        mode: "roles",
                        roleIds: [
                            "broadcaster",
                            "mod"
                        ]
                    }
                ]
            },
            subCommands: [
                {
                    arg: "add",
                    usage: "add [!trigger or \"phrase\"] [message]",
                    description: "Adds a new command with a given response message."
                },
                {
                    arg: "response",
                    usage: "response [!trigger or \"phrase\"] [message]",
                    description: "Updates the response message for a command. Only works for commands that have 1 or less chat effects."
                },
                {
                    arg: "setcount",
                    usage: "setcount [!trigger or \"phrase\"] count#",
                    description: "Updates the commands usage count.",
                    minArgs: 3
                },
                {
                    arg: "cooldown",
                    usage: "cooldown [!trigger or \"phrase\"] [globalCooldownSecs] [userCooldownSecs]",
                    description: "Change the cooldown for a command."
                },
                {
                    arg: "restrict",
                    usage: "restrict [!trigger or \"phrase\"] [All/Sub/Mod/Streamer/Custom Group]",
                    description: "Update permissions for a command."
                },
                {
                    arg: "remove",
                    usage: "remove [!trigger or \"phrase\"]",
                    description: "Removes the given command."
                },
                {
                    arg: "description",
                    usage: "description [!trigger or \"phrase\"]",
                    description: "Updates the description for a command.",
                    minArgs: 3
                },
                {
                    arg: "enable",
                    usage: "enable [!trigger or \"phrase\"]",
                    description: "Disables the given custom command."
                },
                {
                    arg: "disable",
                    usage: "disable [!trigger or \"phrase\"]",
                    description: "Enables the given custom command."
                }
            ]
        });
    }

    /**
     * @override
     * @inheritdoc
     * @param {SystemCommand.CommandEvent} event
     */
    async onTriggerEvent(event) {
        const commandManager = require("../command-manager");
        const chat = require("../../twitch-chat");
        const customCommandManager = require("../custom-command-manager");

        const activeCustomCommands = customCommandManager.getAllItems().filter(c => c.active);

        const triggeredArg = event.userCommand.triggeredArg;

        //grab usage
        let usage = event.command.usage ? event.command.usage : "";
        if (triggeredArg != null) {
            const subCommand = event.command.subCommands.find(
                sc => sc.arg === triggeredArg
            );
            if (subCommand != null) {
                usage = subCommand.usage;
            }
        }

        const args = event.userCommand.args;

        if (args.length < 2) {
            chat.sendChatMessage(
                `Invalid command. Usage: ${event.command.trigger} ${usage}`);
            return;
        }

        const { trigger, remainingData } = seperateTriggerFromArgs(args);

        if (trigger == null || trigger === "") {
            chat.sendChatMessage(
                `Invalid command. Usage: ${event.command.trigger} ${usage}`
            );
            return;
        }

        switch (triggeredArg) {
        case "add": {
            if (args.length < 3 || remainingData == null || remainingData === "") {
                chat.sendChatMessage(
                    `Invalid command. Usage: ${event.command.trigger} ${usage}`
                );
                return;
            }

            if (commandManager.triggerIsTaken(trigger)) {
                chat.sendChatMessage(
                    `The trigger '${trigger}' is already in use, please try again.`
                );
                return;
            }

            const command = {
                trigger: trigger,
                autoDeleteTrigger: false,
                active: true,
                scanWholeMessage: !trigger.startsWith("!"),
                cooldown: {
                    user: 0,
                    global: 0
                },
                effects: {
                    id: uuidv1(),
                    list: [
                        {
                            id: uuidv1(),
                            type: "firebot:chat",
                            message: remainingData
                        }
                    ]
                }
            };

            customCommandManager.saveItem(command, event.userCommand.commandSender);

            chat.sendChatMessage(
                `Added command '${trigger}'!`
            );

            break;
        }
        case "response": {
            if (args.length < 3 || remainingData == null || remainingData === "") {
                chat.sendChatMessage(
                    `Invalid command. Usage: ${event.command.trigger} ${usage}`
                );
                return;
            }

            const command = activeCustomCommands.find(c => c.trigger === trigger);
            if (command == null) {
                chat.sendChatMessage(
                    `Could not find a command with the trigger '${trigger}', please try again.`
                );
                return;
            }

            const chatEffectsCount = command.effects ? command.effects.list.filter(e => e.type === "firebot:chat").length : 0;

            if (chatEffectsCount > 1) {
                chat.sendChatMessage(
                    `The command '${trigger}' has more than one Chat Effect, preventing the response from being editable via chat.`
                );
                return;
            }
            if (chatEffectsCount === 1) {
                let chatEffect = command.effects.list.find(e => e.type === "firebot:chat");
                chatEffect.message = remainingData;
            } else {
                const chatEffect = {
                    id: uuidv1(),
                    type: "firebot:chat",
                    message: remainingData
                };
                command.effects.list.push(chatEffect);
            }

            customCommandManager.saveItem(command, event.userCommand.commandSender);

            chat.sendChatMessage(
                `Updated '${trigger}' with response: ${remainingData}`
            );

            break;
        }
        case "setcount": {
            const countArg = remainingData.trim();
            if (countArg === "" || isNaN(countArg)) {
                chat.sendChatMessage(
                    `Invalid command. Usage: ${event.command.trigger} ${usage}`
                );
                return;
            }

            const command = activeCustomCommands.find(c => c.trigger === trigger);
            if (command == null) {
                chat.sendChatMessage(
                    `Could not find a command with the trigger '${trigger}', please try again.`
                );
                return;
            }

            let newCount = parseInt(countArg);
            if (newCount < 0) {
                newCount = 0;
            }

            command.count = parseInt(newCount);

            customCommandManager.saveItem(command, event.userCommand.commandSender);

            chat.sendChatMessage(
                `Updated usage count for '${trigger}' to: ${newCount}`
            );

            break;
        }
        case "description": {

            const command = activeCustomCommands.find(c => c.trigger === trigger);
            if (command == null) {
                chat.sendChatMessage(
                    `Could not find a command with the trigger '${trigger}', please try again.`
                );
                return;
            }

            if (remainingData == null || remainingData.length < 1) {
                chat.sendChatMessage(
                    `Please provided a description for '${trigger}'!`
                );
                return;
            }

            command.description = remainingData;

            customCommandManager.saveItem(command, event.userCommand.commandSender);

            chat.sendChatMessage(
                `Updated description for '${trigger}' to: ${remainingData}`
            );

            break;
        }
        case "cooldown": {
            const cooldownArgs = remainingData.trim().split(" ");
            if (args.length < 3 || remainingData === "" || cooldownArgs.length < 2 || isNaN(cooldownArgs[0])
                || isNaN(cooldownArgs[1])) {
                chat.sendChatMessage(
                    `Invalid command. Usage: ${event.command.trigger} ${usage}`
                );
                return;
            }

            const command = activeCustomCommands.find(c => c.trigger === trigger);
            if (command == null) {
                chat.sendChatMessage(
                    `Could not find a command with the trigger '${trigger}', please try again.`
                );
                return;
            }

            let globalCooldown = parseInt(cooldownArgs[0]),
                userCooldown = parseInt(cooldownArgs[1]);

            if (globalCooldown < 0) {
                globalCooldown = 0;
            }

            if (userCooldown < 0) {
                userCooldown = 0;
            }

            command.cooldown = {
                user: userCooldown,
                global: globalCooldown
            };

            customCommandManager.saveItem(command, event.userCommand.commandSender);

            chat.sendChatMessage(
                `Updated '${trigger}' with cooldowns: ${userCooldown}s (user), ${globalCooldown}s (global)`
            );

            break;
        }
        case "restrict": {
            if (args.length < 3 || remainingData === "") {
                chat.sendChatMessage(
                    `Invalid command. Usage: ${event.command.trigger} ${usage}`
                );
                return;
            }

            const command = activeCustomCommands.find(c => c.trigger === trigger);
            if (command == null) {
                chat.sendChatMessage(
                    `Could not find a command with the trigger '${trigger}', please try again.`
                );
                return;
            }

            const restrictions = [];
            const roleIds = mapPermArgToRoleIds(remainingData);


            if (roleIds === false) {
                chat.sendChatMessage(
                    `Please provide a valid group name: All, Sub, Mod, Streamer, or a custom group's name`
                );
                return;
            }

            if (roleIds != null) {
                restrictions.push({
                    id: uuidv1(),
                    type: "firebot:permissions",
                    mode: "roles",
                    roleIds: roleIds
                });
            }

            command.restrictionData = { restrictions: restrictions };

            customCommandManager.saveItem(command, event.userCommand.commandSender);

            chat.sendChatMessage(`Updated '${trigger}' restrictions to: ${remainingData}`);

            break;
        }
        case "remove": {

            let command = activeCustomCommands.find(c => c.trigger === trigger);
            if (command == null) {
                chat.sendChatMessage(
                    `Could not find a command with the trigger '${trigger}', please try again.`
                );
                return;
            }

            customCommandManager.deleteItemByTrigger(trigger);

            chat.sendChatMessage(`Successfully removed command '${trigger}'.`);
            break;
        }
        case "disable":
        case "enable": {
            const command = customCommandManager.getAllItems().find(c => c.trigger === trigger);

            if (command == null) {
                chat.sendChatMessage(
                    `Could not find a command with the trigger '${trigger}', please try again.`
                );
                return;
            }

            const newActiveStatus = triggeredArg === "enable";

            if (command.active === newActiveStatus) {
                chat.sendChatMessage(
                    `${trigger} is already ${triggeredArg}d.`
                );
                return;
            }

            command.active = newActiveStatus;

            customCommandManager.saveItem(command, event.userCommand.commandSender);
            customCommandManager.triggerUiRefresh();

            chat.sendChatMessage(
                `${util.capitalize(triggeredArg)}d "${trigger}"`
            );
            break;
        }
        default:
            return;
        }
    }
}

module.exports = new CommandManagement();
