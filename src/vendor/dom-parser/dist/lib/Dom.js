"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Dom = void 0;
const Node_1 = require("./Node");
const NodeAttribute_1 = require("./NodeAttribute");
const tagRegExp = /(<\/?(?:[a-z][a-z0-9]*:)?[a-z][a-z0-9-_.]*?[a-z0-9]*\s*(?:\s+[a-z0-9-_:]+(?:=(?:(?:'[\s\S]*?')|(?:"[\s\S]*?")))?)*\s*\/?>)|([^<]|<(?![a-z/]))*/gi;
const attrRegExp = /\s[a-z0-9-_:]+\b(\s*=\s*('|")[\s\S]*?\2)?/gi;
const splitAttrRegExp = /(\s[a-z0-9-_:]+\b\s*)(?:=(\s*('|")[\s\S]*?\3))?/gi;
const startTagExp = /^<[a-z]/;
const selfCloseTagExp = /\/>$/;
const closeTagExp = /^<\//;
const textNodeExp = /^[^<]/;
const nodeNameExp = /<\/?((?:([a-z][a-z0-9]*):)?(?:[a-z](?:[a-z0-9-_.]*[a-z0-9])?))/i;
const attributeQuotesExp = /^('|")|('|")$/g;
const noClosingTagsExp = /^(?:area|base|br|col|command|embed|hr|img|input|link|meta|param|source)/i;
class Dom {
    constructor(rawHTML) {
        this.rawHTML = rawHTML;
    }
    find(conditionFn, findFirst) {
        const result = find(this.rawHTML, conditionFn, findFirst);
        return findFirst ? result[0] || null : result;
    }
    getElementsByClassName(className) {
        const expr = new RegExp(`^(.*?\\s)?${className}(\\s.*?)?$`);
        return this.find((node) => Boolean(node.attributes.length && expr.test(node.getAttribute('class') || '')));
    }
    getElementsByTagName(tagName) {
        return this.find((node) => node.nodeName.toUpperCase() === tagName.toUpperCase());
    }
    getElementById(id) {
        return this.find((node) => node.getAttribute('id') === id, true);
    }
    getElementsByName(name) {
        return this.find((node) => node.getAttribute('name') === name);
    }
    getElementsByAttribute(attributeName, attributeValue) {
        return this.find((node) => node.getAttribute(attributeName) === attributeValue);
    }
}
exports.Dom = Dom;
// private
function find(html, conditionFn, onlyFirst = false) {
    const generator = domGenerator(html);
    const result = [];
    for (const node of generator) {
        if (node && conditionFn(node)) {
            result.push(node);
            if (onlyFirst) {
                return result;
            }
        }
    }
    return result;
}
function* domGenerator(html) {
    const tags = getAllTags(html);
    let cursor = null;
    for (let i = 0, l = tags.length; i < l; i++) {
        const tag = tags[i];
        const node = createNode(tag, cursor);
        cursor = node || cursor;
        if (isElementComposed(cursor, tag)) {
            yield cursor;
            cursor = cursor.parentNode;
        }
    }
    while (cursor) {
        yield cursor;
        cursor = cursor.parentNode;
    }
}
function isElementComposed(element, tag) {
    if (!tag) {
        return false;
    }
    const isCloseTag = closeTagExp.test(tag);
    const [, nodeName] = tag.match(nodeNameExp) || [];
    const isElementClosedByTag = isCloseTag && element.nodeName === nodeName;
    return isElementClosedByTag || element?.isSelfCloseTag || element?.nodeType === Node_1.NodeType.text;
}
function getAllTags(html) {
    return html.match(tagRegExp) || [];
}
function createNode(tag, parentNode) {
    const isTextNode = textNodeExp.test(tag);
    const isStartTag = startTagExp.test(tag);
    if (isTextNode) {
        return createTextNode(tag, parentNode);
    }
    if (isStartTag) {
        return createElementNode(tag, parentNode);
    }
    return null;
}
function createElementNode(tag, parentNode) {
    var _a;
    const [, nodeName, namespace] = tag.match(nodeNameExp) || [];
    const selfCloseTag = selfCloseTagExp.test(tag) || noClosingTagsExp.test(nodeName);
    const attributes = parseAttributes(tag);
    const elementNode = new Node_1.Node({
        nodeType: Node_1.NodeType.element,
        nodeName,
        namespace,
        attributes,
        childNodes: [],
        parentNode,
        selfCloseTag,
    });
    (_a = parentNode === null || parentNode === void 0 ? void 0 : parentNode.childNodes) === null || _a === void 0 ? void 0 : _a.push(elementNode);
    return elementNode;
}
function parseAttributes(tag) {
    return (tag.match(attrRegExp) || []).map((attributeString) => {
        splitAttrRegExp.lastIndex = 0;
        const exec = splitAttrRegExp.exec(attributeString) || [];
        const [, name = '', value = ''] = exec;
        return new NodeAttribute_1.NodeAttribute({
            name: name.trim(),
            value: value.trim().replace(attributeQuotesExp, ''),
        });
    });
}
function createTextNode(text, parentNode) {
    var _a;
    const textNode = new Node_1.Node({
        nodeType: Node_1.NodeType.text,
        nodeName: '#text',
        text,
        parentNode,
    });
    (_a = parentNode === null || parentNode === void 0 ? void 0 : parentNode.childNodes) === null || _a === void 0 ? void 0 : _a.push(textNode);
    return textNode;
}
