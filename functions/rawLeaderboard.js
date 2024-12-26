/**
 * @param {import("..").Data} d
 */
module.exports = async (d) => {
    const data = d.util.aoiFunc(d);
    if (data.err) return d.error(data.err);

    const [
        variable,
        order = "asc",
        type = "user",
        custom = "{top}. {name}: {value}",
        list = 10,
        page = 1,
        table = d.client.db.tables[0],
    ] = data.inside.splits;

    if (!d.client.variableManager.has(variable.addBrackets())) return d.aoiError.fnError(d, "custom", {}, `Variable ${variable.addBrackets()} Not Found!`);

    if (!order || (order.toLowerCase() !== "asc" && order.toLowerCase() !== "desc")) return d.aoiError.fnError(d, 'custom', {}, `Invalid order must be "desc" or "asc"`);

    let y = 0;
    let value;
    let content = [];
    
    let all;
    let keyPrefix;
    let validateFn;

    switch (type) {
        case "user":
            keyPrefix = `${variable.deleteBrackets()}_%_%`;
            validateFn = async (key) => {
                const [userId, guildId] = key.split("_").slice(1);
                const user = await d.util.getUser(d, userId);
                const guild = await d.util.getGuild(d, guildId);
                return guild && user ? { guild, user } : null;
            };
            break;
        case "server":
            keyPrefix = `${variable.deleteBrackets()}_%_%`;
            validateFn = async (key) => {
                const [guildId] = key.split("_").slice(1);
                const guild = await d.util.getGuild(d, guildId);
                return guild ? { guild } : null;
            };
            break;
        case "globalUser":
            keyPrefix = `${variable.deleteBrackets()}_%_%`;
            validateFn = async (key) => {
                if ((key.match(/_/g) || []).length === 1) {
                const [userId] = key.split("_").slice(1);
                const user = await d.util.getUser(d, userId);
                return user ? { user } : null;
                } else {
                    return null;
                }
            };
            break;
        default:
            return d.aoiError.fnError(d, "custom", {}, `Invalid type: ${type}`);
    }

    try {
        all = await d.client.db.findMany(table, keyPrefix);
    } catch (error) {
        console.error("Error fetching data from the database:", error);
        return d.aoiError.fnError(d, "custom", {}, "Database query failed");
    }
    
    all = all.filter((x, i, y) => y.findIndex(e => e.key === x.key) === i);
    all = all.sort((x, y) => Number(y.value) - Number(x.value));

    const getdata = async (Data) => {
        const validated = await validateFn(Data.key);
        if (validated) {
            return type === "globalUser" ? validated.user : validated;
        }
        return null;
    };

    for (let i = 0; i < all.length; i++) {
        const Data = all[i];
        let user;

        value = Number(Data.value);

        user = await getdata(Data);

        if (user) {
            user = typeof user === "object"
                ? (type === "user" ? user.user : user)
                : { id: user };
            y++;

            let text = custom
                .replaceAll(`{top}`, y)
                .replaceAll("{id}", user.id)
                .replaceAll("{tag}", user?.tag?.removeBrackets())
                .replaceAll(
                    `{name}`,
                    ["user", "globalUser"].includes(type)
                        ? user.username?.removeBrackets()
                        : user.name?.removeBrackets(),
                )
                .replaceAll(`{value}`, value);

            if (text.includes("{execute:")) {
                let ins = text.split("{execute:")[1].split("}")[0];
                const awaited = d.client.cmd.awaited.find((c) => c.name === ins);

                if (!awaited) return d.aoiError.fnError(d, "custom", { inside: data.inside }, ` Invalid awaited command '${ins}' in`);

                const code = await d.interpreter(
                    d.client,
                    {
                        guild: d.message.guild,
                        channel: d.message.channel,
                        author: user,
                    },
                    d.args,
                    awaited,
                    undefined,
                    true,
                );

                text = text.replace(`{execute:${ins}}`, code);
            }

            content.push(text);
        }
    }

    if (order === "desc") content = content.reverse();
    data.result = content.slice(page * list - list, page * list).join("\n");

    return {
        code: d.util.setCode(data),
    };
};