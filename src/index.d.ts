type ZDom = {} & ZNode;

type ZNode = {
  getAttribute: (attr: string) => string;
  getElementsByTagName: (tag: string) => ZNode[];
  getElementsByClassName: (cls: string) => ZNode[];
  getElementById: (id: string) => ZNode;
  getElementsByName: (name: string) => ZNode[];
  nodeType: string;
  nodeName: string;
  childNodes: ZNode[];
  firstChild: ZNode;
  lastChild: ZNode;
  parentNode: ZNode;
  attributes: any[];
  innerHTML: string;
  outerHTML: string;
  textContent: string;

  text: string;
};

type ZNodeText = {
  text: string;
} & ZNode;
