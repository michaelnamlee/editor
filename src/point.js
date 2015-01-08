var util = require('./util');
var assert = util.assert;

var TEXT   = 'text';
var START  = 'start';
var END    = 'end';
var BEFORE = 'before';
var AFTER  = 'after';

/**
 * A class that represents a location in the DOM, offering
 * a more convenient interface to traverse, mutate, compare
 * locations, etc, abstracting away the fairly fiddly code
 * normally needed for complex low-level DOM manipulations.
 *
 * Points offer a semi-opaque abstraction over the multiple
 * ways a particular DOM location can be represented. 
 *
 * For example, when comparing points, the "start" of a 
 * paragraph, a point "before" its first text node, and 
 * a point at offset 0 of the first text node, are all considered 
 * equivalent -- althought, the differences in representation
 * are accessible if needed.
 */
module.exports = Point;

Point.text = text;
Point.start = start;
Point.end = end;
Point.before = before;
Point.after = after;
Point.fromNodeOffset = fromNodeOffset;
Point.of = of;
Point.ofArgs = ofArgs;
Point.check = checkPoint;

var magic = 'xx';

/**
 * A point at the given character offset within a text node
 */
function text(textNode, offset) {
  return new Point(magic).moveToText(textNode, offset);
}

/**
 * A point inside the start of an element
 */
function start(elem) {
  return new Point(magic).moveToStart(elem);
}

/**
 * A point inside the end of an element
 */
function end(elem) {
  return new Point(magic).moveToEnd(elem);
}

/**
 * A point before a node
 */
function before(node) {
  return new Point(magic).moveToBefore(node);
}

/**
 * A point after a node
 */
function after(node) {
  return new Point(magic).moveToAfter(node);
}

/**
 * A point equivalent to that represented by the standard browser node/offset pair idiom
 */
function fromNodeOffset(node, offset) {
  if (node.nodeType === 3) {
    return text(node, offset);
  }

  if (offset === node.childNodes.length) {
    return end(node);
  }

  assert(offset >= 0 && offset < node.childNodes.length,
      'invalid offset for', node, offset);

  return before(node.childNodes[offset]);
}

function ofArgs(args) {
  return of(args[0], args[1]);
}

/**
 * An all-purpose adapter of either a Point, a node/offset pair, or
 * a node/node pair
 */
function of(x, y) {
  if (x instanceof Point) {
    assert(y === undefined);
    return x;
  }

  if (x.nodeType === 3) {
    return text(x, y);
  }

  assert(x.nodeType === 1);
  if (typeof y === 'number') {
    return fromNodeOffset(x, y);
  }

  if (y === null) {
    return end(x);
  }

  assert(checkNode(y).parentNode === x);

  return before(y);
}

function Point(check) {
  assert(check === magic, 'do not construct Point directly');
};
Point.prototype.toString = function() {
  return '[' + this.type + ' ' + this.node + 
      (this.type === TEXT ? ':' + this.offset : '') + ']';
};


Point.prototype.moveToText = function(node, offset) {
  this.type = TEXT;
  this.node = checkText(node);
  assert(typeof offset === 'number', 'offset num required');

  assert(offset >= 0 && offset <= node.data.length, 'offset out of range', node.data, offset);
  this.offset = offset;
  return this;
};

Point.prototype.moveToTextStart = function(node) {
  this.moveToText(node, 0);
};

Point.prototype.moveToTextEnd = function(node) {
  this.moveToText(node, node.length);
};

Point.prototype.moveToStart = function(elem) {
  this.type = START;
  this.node = checkElem(elem);
  this.offset = null;
  return this;
};

Point.prototype.moveToEnd = function(elem) {
  this.type = END;
  this.node = checkElem(elem);
  this.offset = null;
  return this;
};

Point.prototype.moveToBefore = function(node) {
  this.type = BEFORE;
  this.node = checkNode(node);
  this.offset = null;
  return this;
};

Point.prototype.moveToAfter = function(node) {
  this.type = AFTER;
  this.node = checkNode(node);
  this.offset = null;
  return this;
};

/**
 * Returns a standard browser node/offset pair as a two element array.
 */
Point.prototype.toNodeOffset = function() {
  switch (this.type) {
    case TEXT: return [this.node, this.offset];
    case START: return [this.node, 0];
    case END: return [this.node, this.node.childNodes.length];
    case BEFORE: return [
        checkHasParent(this.node).parentNode, 
        childIndex(this.node)];
    case AFTER: return [
        checkHasParent(this.node).parentNode, 
        childIndex(this.node) + 1];
    default: assert(false);
  }
};

/**
 * The index of the given node within its parent's children
 */
function childIndex(child) {
  var elem = child.parentNode;
  var children = elem.childNodes;
  var len = children.length;
  for (var i = 0; i < len; i++) {
    if (children[i] === child) {
      return i;
    }
  }

  assert(false, 'not parent-child:', elem, child);
}

/**
 * Ensures the point is suitable for element insertion, by splitting
 * the text node it is within if necessary, otherwise does nothing.
 * Either way, moves itself to a suitable insertion point.
 * (and returns itself)
 */
Point.prototype.ensureInsertable = function() {
  if (this.type === TEXT && this.offset > 0 && this.offset < this.node.length) {
    return this.moveToBefore(this.node.splitText(this.offset));
  }

  return this;
};

/**
 * Inserts the given node at this point.
 */
Point.prototype.insert = function(newChild) {
  var p = this.rightNormalized();

  if (p.type === TEXT) {
    p.node.parentNode.insertBefore(newChild, p.node.splitText(p.offset));
  } else if (p.type === BEFORE) {
    p.node.parentNode.insertBefore(newChild, p.node);
  } else if (p.type === END) {
    p.node.appendChild(newChild);
  } else {
    assert(false);
  }
};


/**
 * Split at a point.
 */
Point.prototype.splitRight = function(splitWith) {
  this.setTo(splitRight(this, splitWith).rightNormalized());
}

function splitRight(splitPoint, splitWith) {
  splitPoint.ensureInsertable();
  splitPoint = splitPoint.rightNormalized();
  var avoidSplittingIfPossible = !splitWith;
  
  var resultPoint = Point.after(splitPoint.containingElement());
  
  if (resultPoint.type === END && avoidSplittingIfPossible) {
    return resultPoint;
  }

  var originalElem = splitPoint.containingElement();
  if (splitWith === true || !splitWith) {
    splitWith = originalElem.cloneNode(false);
  }
  checkElem(splitWith);
  resultPoint.insert(splitWith);

  if (splitPoint.type === BEFORE) {
    do {
      var node = originalElem.lastChild;
      splitWith.insertBefore(node, splitWith.firstChild);
    } while (node != splitPoint.node);

  } else if (splitPoint.type === END) {
    // do nothing
  } else {
    assert(false);
  }

  return Point.before(splitWith);
};

/**
 * Adjusts the internal representation to be right-biased,
 */
Point.prototype.rightNormalized = function() {
  var p = this.nodeNormalized();

  if (p.type == TEXT) {
    return p;
  } else if (p.type == AFTER) {
    var next = p.node.nextSibling;
    if (next) {
      return before(next);
    } else {
      return end(p.node.parentNode);
    }
  } else if (p.type == START) {
    var child = p.node.firstChild;
    if (child) {
      return before(child);
    } else {
      return end(p.node);
    }
  }

  assert(p.type === BEFORE || p.type === END);

  return p;
};

/**
 * Adjusts the internal representation to be left-biased,
 */
Point.prototype.leftNormalized = function() {
  var p = this.nodeNormalized();
  if (p.type == TEXT) {
    return p;
  } else if (p.type == BEFORE) {
    var prev = p.node.previousSibling;
    if (prev) {
      return after(prev);
    } else {
      return start(p.node.parentNode);
    }
  } else if (p.type == END) {
    var child = p.node.lastChild;
    if (child) {
      return after(child);
    } else {
      return start(p.node);
    }
  }

  assert(p.type === AFTER || p.type === START);

  return p;
};


/**
 * Returns the containing element.
 */
Point.prototype.containingElement = function() {
  switch (this.type) {
    case TEXT:
    case BEFORE:
    case AFTER:
      return this.node.parentNode;
    case START:
    case END:
      return this.node;
    default: assert(false);
  }
};



/**
 * Returns the containing element, if the point is at its start
 * otherwise null.
 */
Point.prototype.elemStartingAt = function() {
  if (this.type === TEXT) {
    return this.offset === 0 && util.isFirstChild(this.node) || null;
  } else if (this.type === BEFORE) {
    return util.isFirstChild(this.node);
  } else if (this.type === START) {
    return this.node;
  } else if (this.type === END) {
    return this.node.firstChild ? null : this.node;
  } else {
    return null;
  }
};

/**
 * Returns the containing element, if the point is at its end
 * otherwise null.
 */
Point.prototype.elemEndingAt = function() {
  if (this.type === TEXT) {
    return this.offset === this.node.length && util.isLastChild(this.node) || null;
  } else if (this.type === AFTER) {
    return util.isLastChild(this.node);
  } else if (this.type === END) {
    return this.node;
  } else if (this.type === START) {
    return this.node.firstChild ? null : this.node;
  } else {
    return null;
  }
};

Point.prototype.nodeBefore = function() {
  var left = this.leftNormalized();
  switch (left.type) {
    case TEXT: return null;
    case START: return null;
    case AFTER: return left.node;
    default: assert(false);
  }
};
Point.prototype.elemBefore = function() {
  var node = this.nodeBefore();
  return node && node.nodeType === 1 ? node : null;
};
Point.prototype.hasTextBefore = function() {
  var left = this.leftNormalized();
  switch (left.type) {
    case TEXT: return true;
    case START: return false;
    case AFTER: return left.node.nodeType === 3;
    default: assert(false);
  }
};

Point.prototype.nodeAfter = function() {
  var right = this.rightNormalized();
  switch (right.type) {
    case TEXT: return null;
    case END: return null;
    case BEFORE: return right.node;
    default: assert(false);
  }
};
Point.prototype.elemAfter = function() {
  var node = this.nodeAfter();
  return node && node.nodeType === 1 ? node : null;
};
Point.prototype.hasTextAfter = function() {
  var right = this.rightNormalized();
  switch (right.type) {
    case TEXT: return true;
    case END: return false;
    case BEFORE: return right.node.nodeType === 3;
    default: assert(false);
  }
};

Point.prototype.isWithin = function(elem) {
  assert(false, 'unimplemented');
};

/**
 * Returns a negative number if this point is before the
 * other point in depth-first dom-traversal order, positive
 * if it is after, or zero if the two points are equivalent.
 *
 * NB that a point at the "start" of a paragraph, a point
 * "before" its first text node, and a point at offset 0 of
 * the first text node, are all considered equivalent.
 */
Point.prototype.compare = function(point) {
  Point.check(point);

  var p1 = this.rightNormalized();
  var p2 = point.rightNormalized();

  var relationship = util.compareNodes(p1.node, p2.node);
  if (relationship == 'before') {
    return -1;
  }
  if (relationship == 'after') {
    return 1;
  }
  if (relationship == 'parent') {
    return p1.type !== END ? -1 : 1;
  }
  if (relationship == 'child') {
    return p2.type === END ? -1 : 1;
  }
  if (relationship == 'same') {
    if (p1.type === TEXT && p2.type === TEXT) {
      return p1.offset - p2.offset;
    } else if (p1.type === TEXT) {
      return 1;
    } else if (p2.type === TEXT) {
      return -1;
    } else {
      assert(p1.type === p2.type, p1.type, '!=', p2.type);
      return 0;
    }
  }

  assert(false, 'unhandled situation - ', relationship);
};

/**
 * Returns new point out of text nodes, into the gap between them
 * if possible. If deep in a text node, returns original. If already
 * a node point, returns self.
 */
Point.prototype.nodeNormalized = function(mustLeave) {
  if (this.type == TEXT) {
    if (this.offset === 0) {
      return before(this.node);
    }
    if (this.offset === this.node.length) {
      return after(this.node);
    }
    assert(this.offset > 0 && this.offset < this.node.length);
  }

  return this;
};

Point.prototype.copy = function() {
  var point = new Point(magic);
  point.type = this.type;
  point.node = this.node;
  point.offset = this.offset;
  return point;
};


Point.prototype.setTo = function(point) {
  this.type = point.type;
  this.node = point.node;
  this.offset = point.offset;
}

//function rightNormalized0(func) {
//  return function() {
//    func(this.rightNormalized());
//  };
//}
//function rightNormalized1(func) {
//  return function(arg1) {
//    func(this.rightNormalized(), arg1);
//  };
//}
//
//function leftNormalized0(func) {
//  return function() {
//    func(this.leftNormalized());
//  };
//}
//function leftNormalized1(func) {
//  return function(arg1) {
//    func(this.leftNormalized(arg1));
//  };
//}

function checkHasParent(node) {
  assert(node.parentNode, 'node not attached to a parent', node);
  return node;
}

function checkElem(node) {
  assert(node.nodeType === 1, 'not an element', node);
  return node;
}
function checkText(node) {
  assert(node.nodeType === 3, 'not a text node', node);
  return node;
}
function checkNode(node) {
  assert(node.nodeType === 1 || node.nodeType === 3, 'invalid node', node);
  return node;
}
function checkPoint(obj) {
  assert(obj instanceof Point, 'object not a Point', obj);
  return obj;
}