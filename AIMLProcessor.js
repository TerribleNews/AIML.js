var xmldom = require('xmldom');
var DOMParser = new xmldom.DOMParser();
var DOMPrinter = new xmldom.XMLSerializer();
var fs = require('fs');

function AIMLProcessor(template, inputStars, thatStars, topicStars, history, bot) {
  this.template = template;
  this.inputStars = inputStars;
  this.thatStars = thatStars;
  this.topicStars = topicStars;
  this.history = history;
  this.bot = bot;
  this.sraiCount = 0;
}

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

AIMLProcessor.prototype.getAttributeOrTagValue = function (node, attrName)
{
  var result = "";
  if (node.hasAttribute(attrName)) {
    return node.getAttribute(attrName)
  }
  for (var i = 0; i < node.childNodes.length; i++)
  {
    var n = node.childNodes[i];
    if (n.nodeName == attrName) {
      return this.evalTagContent( n )
    }
  }
}

AIMLProcessor.prototype.evalTagContent = function(node)
{
  var result = "";
  if (node.hasChildNodes())
  {
    for (var i = 0; i < node.childNodes.length; i++)
    {
      result = result + this.recursEval(node.childNodes[i]);
    }
  }
  return result;
}

AIMLProcessor.prototype.random = function(node)
{
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
  return this.evalTagContent(liList[r]);
}

AIMLProcessor.prototype.inputStar = function(node)
{
  var index = this.getAttributeOrTagValue(node, "index") - 1;
  if (!index) { index = 0; }
  return this.inputStars[index];
}

AIMLProcessor.prototype.thatStar = function(node)
{
  var index = this.getAttributeOrTagValue(node, "index") - 1;
  if (!index) { index = 0; }
  return this.thatStars[index];
}

AIMLProcessor.prototype.topicStar = function(node)
{
  var index = this.getAttributeOrTagValue(node, "index") - 1;
  if (!index) { index = 0; }
  return this.topicStars[index];
}

AIMLProcessor.prototype.botNode = function (node)
{
  var prop = this.getAttributeOrTagValue(node, "name");
  return this.bot.properties.get(prop).trim();
}

AIMLProcessor.prototype.date = function(node) {
  var format   = this.getAttributeOrTagValue(node, "format");
  var locale   = this.getAttributeOrTagValue(node, "locale");
  var timezone = this.getAttributeOrTagValue(node, "timezone");
  var strftime = require('strftime');
  // console.log("Date tag with format " + format + " locale " + locale + " timzeone " + timezone);
  var result = strftime.timezone(timezone).localize(locale)(format);
  // console.log("   Result:" + result);
  return result;
}

AIMLProcessor.prototype.interval = function(node) {
  // console.log(DOMPrinter.serializeToString(node));
  var style  = this.getAttributeOrTagValue(node, "style");
  var format = this.getAttributeOrTagValue(node, "format");
  var from   = Date.parse(this.getAttributeOrTagValue(node, "from"));
  var to     = Date.parse(this.getAttributeOrTagValue(node, "to"));
  // console.log("Looking for interval between " + from + ' and ' + to);
  if (style == null)   { style = "years" }
  if (format == null) { format = "%B %d, %Y"; }
  if (from == null)    { from = Date.parse("January 1, 1970") }
  if (to == null)      { to = new Date()}
  var delta = new Date(to - from);
  var result = "unknown";
  if (style == "years")  { result = ""+Math.floor(delta.getYear()-70) }
  if (style == "months") { result = ""+Math.floor( (delta.getYear()-70)*12 + delta.getMonth() ) }
  if (style == "days")   { result = ""+Math.floor( delta.valueOf() / (24*60*60*1000) ) }
  if (style == "hours" ) { result = ""+Math.floor( delta.valueOf() / (60*60*1000) ) }
  return result
}

AIMLProcessor.prototype.recursEval = function (node)
{
  if (node.nodeName == "#text") { return node.nodeValue }
  else if (node.nodeName == "#comment") { return "" }
  else if (node.nodeName == "template") { return this.evalTagContent( node ) }
  else if (node.nodeName == "random" ) { return this.random( node ) }
  else if (node.nodeName == "star") { return this.inputStar( node ) }
  else if (node.nodeName == "thatstar") { return this.inputStar( node ) }
  else if (node.nodeName == "topicstar") { return this.inputStar( node ) }
  else if (node.nodeName == "bot") { return this.botNode( node ) }
  else if (node.nodeName == "interval") { return this.interval(node) }
  else if (node.nodeName == "date") { return this.date(node) }
  else { return DOMPrinter.serializeToString(node) }
}

AIMLProcessor.prototype.evalTemplate = function () {
  var response = "";
  var template = "<template>"+this.template+"</template>";
  var root = DOMParser.parseFromString(template).childNodes[0];
  response = this.recursEval(root);
  return response;
}

// Static functions
AIMLProcessor.trimTag =  trimTag;
AIMLProcessor.AIMLToCategories = AIMLToCategories;

module.exports = AIMLProcessor;
