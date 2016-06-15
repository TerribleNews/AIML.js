var xmldom = require('xmldom');
var DOMParser = new xmldom.DOMParser();
var DOMPrinter = new xmldom.XMLSerializer();
var fs = require('fs');

function trimTag(serializedXML, tagName)
{
  // pull the middle bit out of this XML with a regexp
  var startTag = "<" + tagName + ">",
  endTag = "</" + tagName + ">";
  // console.log("Stripping ", tagName, " tags from ", serializedXML);
  if (serializedXML.startsWith(startTag) &&
  serializedXML.endsWith(endTag))
  {
    // if there was a match, the full match is in
    // matched[0] and the first bracket matched is in matched[1]
    return serializedXML.substr(startTag.length, serializedXML.length - startTag.length - endTag.length);
  }
}

function categoryProcessor(node, topic, filename, language)
{
  // console.log("Processing category node ", DOMPrinter.serializeToString(node));
  var c = {depth: 0, pattern: '*', topic: topic, that: '*', template: '', file: filename};
  for (var i = 0; i < node.childNodes.length; i++)
  {
    var m = node.childNodes[i];
    var mName = m.nodeName;
    if (mName == '#text') {/*skip*/}
    else if (mName == "pattern")
    {
      c.pattern = trimTag(DOMPrinter.serializeToString(m), 'pattern')
      .replace(/[\r\n]/g, '').replace(/\s+/g, ' ').trim();
    }
    else if (mName == "that")
    {
      c.that = trimTag(DOMPrinter.serializeToString(m), 'that')
      .replace(/[\r\n]/g, '').replace(/\s+/g, ' ').trim();
    }
    else if (mName == "topic")
    {
      c.topic = trimTag(DOMPrinter.serializeToString(m), 'topic')
      .replace(/[\r\n]/g, '').replace(/\s+/g, ' ').trim();
    }
    else if (mName == "template")
    {
      // console.log("Found template tag: " + DOMPrinter.serializeToString(m));
      c.template = trimTag(DOMPrinter.serializeToString(m), 'template').trim();
    }
    else
    {
      console.log("categoryProcessor: unexpected <" + mName + "> in file ", filename);
    }
  }
  if (!c.template)
  {
    return null;
  }
  else
  {
    return c;
  }
}

// takes a filename and a callback function which takes an array of categories
function  AIMLToCategories(filename, callback) {

  // load the file into a single string and process it with xmldom
  fs.readFile(filename, {encoding:'utf-8'}, function(err, aiml_string) {
    // Return an Array of categories
    var categories = new Array();

    var language = 'english'; // should define a default somewhere

    // parse the string but get rid of the newlines because we dont't need them
    var doc = DOMParser.parseFromString(aiml_string);
    var aiml = doc.getElementsByTagName('aiml');
    if (aiml.length > 1)
    {
      throw new Error("Too many aiml nodes in file " + filename);
    }
    else
    {
      aiml = aiml[0];
    }

    if (aiml.hasAttribute('language'))
    {
      language = aiml.getAttribute('language');
    }
    for (var i = 0; i < aiml.childNodes.length; i++)
    {
      var n = aiml.childNodes[i];
      if (n.nodeName == 'category') {
        var c = categoryProcessor(n, '*', filename, language);
        if (c)
        {
          // console.log("Adding node " + i);
          categories.push(c);
        }
        else
        {
          console.log("Discarding category at node " + i);
        }
      }
      else if (n.nodeName == "topic")
      {
        var topic = n.getAttribute('name');
        for (var j = 0; j < n.childNodes.length; j++)
        {
          var m = n.childNodes[j];
          if (m.nodeName == 'category')
          {
            var c = categoryProcessor(m, topic, filename, language);
            if (c)
            {
              categories.push(c);
            }
          }
        }
      }
    }
    callback(categories);
  });
}

function getAttributeOrTagValue(node, inputStars, sraiCount, attrName)
{
  var result = "";
  if (node.hasAttribute(attrName)) { return node.getAttribute(attrName) }
  for (var i = 0; i < node.childNodes.length; i++)
  {
    var n = node.childNodes[i];
    if (n.nodeName == attrName) { return evalTagContent( n, inputStars, sraiCount ) }
  }
}

function evalTagContent(node, inputStars, sraiCount)
{
  var result = "";
  if (node.hasChildNodes())
  {
    for (var i = 0; i < node.childNodes.length; i++)
    {
      result = result + recursEval(node.childNodes[i], inputStars, sraiCount);
    }
  }
  return result;
}

function random(node, inputStars, sraiCount) {
  var liList = [];
  for (var i = 0; i < node.childNodes.length; i++)
  {
    var n = node.childNodes[i];
    if (n.nodeName == "li")
    {
      liList.push(n)
    }
  }
  var r = Math.floor(Math.random() * liList.length);
  return evalTagContent(liList[r], inputStars, sraiCount);
}

function star(node, inputStars, sraiCount)
{
  var index = getAttributeOrTagValue(node, inputStars, sraiCount, "index") - 1;
  if (!index) { index = 0; }
  return inputStars[index];
}

function recursEval(node, inputStars, sraiCount)
{
  if (node.nodeName == "#text") { return node.nodeValue }
  else if (node.nodeName == "#comment") { return "" }
  else if (node.nodeName == "template") { return evalTagContent(node, inputStars, sraiCount) }
  else if (node.nodeName == "random" ) { return random(node, inputStars, sraiCount) }
  else if (node.nodeName == "star") { return star(node, inputStars, sraiCount ) }

}

function evalTemplate(template, inputStars, sraiCount) {
  if (sraiCount == undefined) { sraiCount = 0; }
  var response = "";
  template = "<template>"+template+"</template>";
  var root = DOMParser.parseFromString(template).childNodes[0];
  response = recursEval(root, inputStars, sraiCount);
  return response;
}

var AIMLProcessor = {
  trimTag: trimTag,
  AIMLToCategories: AIMLToCategories,
  evalTemplate: evalTemplate,

  // getAttributeOrTagValue: getAttributeOrTagValue,

}

module.exports = AIMLProcessor;
