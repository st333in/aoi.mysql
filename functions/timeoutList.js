module.exports = async (d) => {
    const data = d.util.aoiFunc(d);

    const [format = "key", separator = " , "] = data.inside.splits;

    const query = 'setTimeout_%';

    const timeouts = await d.client.db.findMany("__aoijs_vars__", query);

    if (timeouts && Array.isArray(timeouts)) {
        const timeoutData = timeouts.map((x) => {
            let parsedValue;
            try {
                parsedValue = JSON.parse(x.value);
            } catch (error) {
                parsedValue = {};
            }

            if (format === "duration") {
                return parsedValue["__duration__"] || null;
            } else if (format === "key") {
                return x["key"] || null;
            } else if (format === "id") {
                return parsedValue["__id__"] || null; 
            } else {
                return format
                    .replaceAll("{duration}", parsedValue["__duration__"] !== undefined ? parsedValue["__duration__"] : "N/A")
                    .replaceAll("{key}", x["key"] !== undefined ? x["key"] : "N/A")
                    .replaceAll("{id}", parsedValue["__id__"] !== undefined ? parsedValue["__id__"] : "N/A");
            }
        });

        data.result = timeoutData.filter(item => item !== null).join(separator);
    } else {
        data.result = null;
    }

    return {
        code: d.util.setCode(data)
    };
};