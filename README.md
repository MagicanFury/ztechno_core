# ztech_jquery_ext
#### Extends JQuery library for more compact code base

[![npm version](https://badge.fury.io/js/ztech_jquery_ext.svg)](https://www.npmjs.com/package/ztech_jquery_ext)

Requirements
-----
  + [jQuery](http://jquery.com/)


Installation
-----

### [NPM](https://www.npmjs.com/package/ztech_jquery_ext)
```bash
npm install ztech_jquery_ext
```

### [Yarn](https://yarn.pm/ztech_jquery_ext)
```bash
yarn add ztech_jquery_ext
```

### [CDN - jsDelivr](https://www.jsdelivr.com/package/npm/ztech_jquery_ext)
```html
<link href="https://cdn.jsdelivr.net/npm/ztech_jquery_ext/dist/css/ztech_jquery_ext.min.css" rel="stylesheet" type="text/css" />
<script src="https://cdn.jsdelivr.net/npm/ztech_jquery_ext/dist/js/ztech_jquery_ext.min.js" type="text/javascript"></script>
```    

### [CDN - UNPKG](https://unpkg.com/browse/ztech_jquery_ext/)
```html
<link href="https://unpkg.com/ztech_jquery_ext/dist/css/ztech_jquery_ext.min.css" rel="stylesheet" type="text/css" />
<script src="https://unpkg.com/ztech_jquery_ext/dist/js/ztech_jquery_ext.min.js" type="text/javascript"></script>
```

TypeScript Support
-----
In order to include types add the following in tsconfig.json
```json
{
  "compilerOptions": {
    "types": ["ztech_jquery_ext"]
  }
}
```

Alternatively Add the following reference at the top of the javascript/typescript file
```js
/// <reference types="ztech_jquery_ext" />
```

Usage
-----

Include jQuery
```html
<script src="https://code.jquery.com/jquery-3.3.1.min.js"></script>
```

Include Plugin JS
```html
<script src="https://cdn.jsdelivr.net/npm/ztech_jquery_ext/dist/js/ztech_jquery_ext.min.js" type="text/javascript"></script>
```

Usage
```js
// [JQuery, JQuery, JQuery, ...]
var rows = $('.row').$arr();

// [number, number, number, ...]
var userids = $('.user').$map(function ($ele) {
  return $ele.attr('id');
});
```

License
----
MIT


Created with :heart: [create-jquery-plugin](https://www.npmjs.com/package/create-jquery-plugin)
