
// In a non-commonjs app, would include this with a script tag.
// This script puts "qed" in the global scope.
require('../src/client');


window.onload = function() {
  var Editor = qed.Editor;
  var Toolbar = qed.Toolbar;

  var editor = new Editor();
  editor.addListener({
    onContent: function() {
      showContent();
    },
    onAttached: function() {
      console.log("Editor attached");
    },
    onKeypress: function(e) {
      // quick hack to test plumbing
      if (e.keyCode == 13) {
        console.log('enter, saving sel markers');
        editor.selection().saveToMarkers();
      }
    },
    onKey: function(e) {
      if (e.keyType == 'backspace' && e.point.type == 'start') {
        e.preventDefault();
      }
      return true;
    }
  });

  editor.attach($('editor'));
  editor.focus();
  showContent();

  var toolbar = new Toolbar(editor);

  function showContent() {
    $('content').innerHTML = '';
    $('content').appendChild(document.createTextNode($('editor').innerHTML));
  }

  function $(id) {
    return document.getElementById(id);
  }

};