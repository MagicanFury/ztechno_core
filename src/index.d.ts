interface JQuery {
  /**
   * Converts JQuery Object to array of JQuery elements
   * @returns {JQuery[]} Array of JQuery Elements
   */
  $arr: () => JQuery[];

  /**
   * Array map implementation with every element in the array representing a JQuery element
   * @param {(value: JQuery, index: number, array: readonly JQuery[]) => U} callbackfn
   * @returns {U[]} Collection of map return values
   */
  $map: <U>(callbackfn: (value: JQuery, index: number, array: readonly JQuery[]) => U) => U[];
}

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
