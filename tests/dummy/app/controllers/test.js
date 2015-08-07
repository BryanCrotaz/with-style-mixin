import Ember from 'ember';

export default Ember.Controller.extend({
  width:     10,
  height:    20,
  margin:    '10px',
  marginTop: '1',
  isShown:   true,
  isLarge:   false,
  backgroundColor: 'url("javascript:alert(\'XSS\')")',
  color: new Ember.Handlebars.SafeString('url("javascript:alert(\'XSS\')")')
});
