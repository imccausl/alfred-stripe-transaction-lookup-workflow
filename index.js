require("dotenv").config();
const Stripe = require("stripe");
const alfy = require("alfy");

const RELEVANT_KEYS = [
    "id",
    "amount",
    "amount_refunded",
    "description",
    "currency",
    "disputed",
    "metadata",
    "receipt_url",
    "refunds",
    "status"
];
const RELEVANT_METADATA_KEYS = ["", ""];

const CURRENCY_TO_API_KEY_MAP = {};

function formatCurrency(cents) {
    return (cents / 100).toFixed(2);
}

function getStripeApi(currency) {
    const { CA_API_KEY, US_API_KEY, AU_API_KEY } = process.env;
    const serverMap = {
        cad: CA_API_KEY,
        usd: US_API_KEY,
        aud: AU_API_KEY
    };

    try {
        return Stripe(serverMap[currency.toLowerCase()]);
    } catch (e) {
        alfy.error(`Could not get API key: ${e}`);
    }
}

async function getCharge(transaction) {
    // check USD first
    let stripe = getStripeApi("usd");

    try {
        let charge = await stripe.charges.retrieve(transaction);
        return charge;
    } catch (e) {
        try {
            stripe = getStripeApi("cad");
            charge = await stripe.charges.retrieve(transaction);
            return charge;
        } catch (e) {
            try {
                stripe = getStripeApi("aud");
                charge = await stripe.charges.retrieve(transaction);
                return charge;
            } catch (e) {
                alfy.error(`No charge found for ${transaction}: ${e}`);
            }
        }
    }
}

function simplifyCharge(chargeObj, keys) {
    const simpleTransaction = {};
    keys.forEach(key => (simpleTransaction[key] = chargeObj[key]));
    return simpleTransaction;
}

function createOutput(data) {
    /* KEYS
        "id",
        "amount",
        "amount_refunded",
        "description",
        "disputed",
        "metadata",
        "receipt_url",
        "currency",
        "refunds",
        "status"
    */
    const items = [];
    const simpleData = simplifyCharge(data, RELEVANT_KEYS);
    const {
        id,
        amount,
        amount_refunded,
        description,
        disputed,
        currency,
        metadata,
        receipt_url,
        refunds,
        status
    } = simpleData;

    const item = {
        title: `${
            metadata[""]
                ? `User ID: ${metadata[""]
                      .replace("production:us-", "")
                      .replace("production:ca-", "")}`
                : ""
        } status: ${status} Refunded: ${amount_refunded >
            0} ${currency.toUpperCase()} `,
        subtitle: `${id} Paid: ${formatCurrency(
            amount
        )}, Refunded: ${formatCurrency(
            amount_refunded
        )} ${currency.toUpperCase()}`,
        text: {
            copy: metadata[""] ? metadata[""] : receipt_url,
            large_type: receipt_url
        },
        arg: id,
        variables: {
            receipt: receipt_url,
            charge: id,
            userId: metadata[""] ? metadata[""] : null
        }
    };

    // Add the charge item
    items.push(item);

    // if there are refunds, add the information about the refund, below
    if (refunds.data.length) {
        refunds.data.forEach(refund => {
            const { id, charge, amount, currency, metadata } = refund;
            const refundItem = {
                title: metadata[""]
                    ? `${metadata[""]} refund for ${formatCurrency(
                          amount
                      )} ${currency.toUpperCase()}`
                    : `Refund of $${formatCurrency(
                          amount
                      )} ${currency.toUpperCase()}`,
                subtitle: `${id}, ${status}, associated charge: ${charge}`,
                text: {
                    copy: charge,
                    large_type: charge
                },
                icon: {
                    path: "./icons/refund-512.png"
                },
                arg: charge,
                variables: {
                    receipt: receipt_url,
                    charge
                }
            };

            items.push(refundItem);
        });
    }

    return items;
}

const transaction = await getCharge(alfy.input.trim());
const items = createOutput(transaction);

alfy.output(items);

//alfy.log(transaction);
