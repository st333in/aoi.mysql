/**
 * @param {import("..").Data} d
 */
module.exports = async (d) => {
    const data = d.util.aoiFunc(d);
    if (data.err)
        return d.error(data.err);
    const [id] = data.inside.splits;
    const MAX_TIMEOUT_DURATION = 0x7FFFFFFF;
    const timeoutRequest = await d.client.db.get("__aoijs_vars__", "setTimeout", id);
    const timeout = JSON.parse(timeoutRequest)

    if (!timeout)
        return d.aoiError.fnError(d, "custom", { inside: data.inside }, "Invalid Timeout ID Provided In");
    if ((timeout.__duration__ - Date.now()) <= MAX_TIMEOUT_DURATION) {
        clearTimeout(timeout.__id__);
    }
    else {
        clearInterval(timeout.__id__);
    }
    await d.client.db.delete("__aoijs_vars__", "setTimeout", id);
    return {
        code: d.util.setCode(data),
    };
};