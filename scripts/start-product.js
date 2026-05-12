process.env.PHONE_PRODUCT_MODE = process.env.PHONE_PRODUCT_MODE || "1";
process.env.PHONE_PUBLIC_TUNNEL = process.env.PHONE_PUBLIC_TUNNEL || "0";

require("./start-phone");
