
var Apotheke = WinJS.Class.define(
        // Constructor
        function (name, street, zipcode,
			        city, telephone, fax, email, notdienst,
			        distance, latitude, longitude, startdate,
			        starttime, enddate, endtime) {
            // Name and contact details
            this.name = name;
            this.street = street;
            this.zipcode = zipcode;
            this.city = city;
            this.telephone = telephone;
            this.fax = fax;
            this.email = email;
            this.notdienst = notdienst;

            //The distance to the users location and geo location
            this.distance = distance;
            this.latitude = latitude;
            this.longitude = longitude;

            // Notdienst opening hours
            this.startdate = startdate;
            this.starttime = starttime;
            this.enddate = enddate;
            this.endtime = endtime;
        },
        // Instance members
        {},
        // Static member
        {
            equals: function (first, second) {

               // return (first.name == second.name && first.street == second.street && first.city == second.city && first.zipcode == second.zipcode);
            },

            getAddress: function (apotheke) {
                return apotheke.street + " " + apotheke.zipcode + " " + apotheke.city;
            }
        }
    );

(function () {
    "use strict";

    // Debug or Release Build?
    var DEBUG = true;

    // The URL of the Apotheken webservice 
    var windowsWebserviceUrl;
    var _DATA_EXPIRES_TIMEOUT;

    var windowsServiceURL = "http://apotheken.qa-move.aperto.de/interface/?userid=windows&password=mZMVhG&"

    if (!DEBUG) {
        windowsWebserviceUrl = "http://62.154.228.13/interface/?userid=windows&password=mZMVhG&"; //Live
        //windowsWebserviceUrl = "http://apotheken.qa-move.aperto.de/interface/?userid=windows&password=mZMVhG&";
        _DATA_EXPIRES_TIMEOUT = 15 * 60 * 1000; // 15 Minutes
    } else {
        windowsWebserviceUrl = "http://testing.move.aperto.de/aponet/interface/?userid=windows&password=mZMVhG&"; //STAGING
        //windowsWebserviceUrl = "http://apotheken.qa-move.aperto.de/interface/?userid=windows&password=mZMVhG&";
        _DATA_EXPIRES_TIMEOUT = 30 * 1000; // 30 seconds
    }

    // Timeout for network requests
    var REQUEST_TIMEOUT = 10000; // 10 seconds

    WinJS.Namespace.define("Application", {
        // The map boundaries of Germany. Initialized in default.js after Bing Maps is loaded
        BOUNDS_GERMANY: null,
        // Data Exires
        DATA_EXPIRES_TIMEOUT: _DATA_EXPIRES_TIMEOUT, // minutes * seconds * microseconds
        // A Bing Maps search manager that can be used throughout the app for geocoding requests
        searchManager: null,

        // State that is saved to disk when the user navigates to another page
        state : {
            // Currently in notdienst mode
            notdienst: true,
            // Current view bounds of the map. Only updated just before state is saved!
            mapBounds: null,
            // Time the data was requested
            timestamp: null,
            // The users location on the map. Null is not selected yet
            latitude: null,
            longitude: null,
            // The last list of regular apotheken received. Empty if none were requested yet
            regularApotheken: [],
            // The last list of notdienst apotheken received. Empty if none were requested yet
            notdienstApotheken: [],
        },

        // Save the views state of the view to disk
        saveState: function () {
            // Get the roaming settings storage
            var roamingSettings = Windows.Storage.ApplicationData.current.roamingSettings;
            
            try {
                // For each field of the state
                for (var s in Application.state) {
                    // Stringify the value and write it to disk
                    roamingSettings.values[s] = JSON.stringify(Application.state[s]);
                }
            }
            // In case anything goes wrong, for exmple because we exceed the quota ...
            catch (e) {
                // remove all keys, so we don't end up restoring inconsiten state
                for (var s in Application.state) {
                    roamingSettings.values.remove(s);
                }
            }
        },

        // Restore the state of this view from disk
        restoreState: function () {
            // Get the roaming settings storage
            var roamingSettings = Windows.Storage.ApplicationData.current.roamingSettings;

            // Note: All of the saved state should be restored or nothing. That is why we fill a 
            // temporary property bag first an only commit the restored state to Application.state
            // if no exceptions are thrown
            try
            {
                // Temporary storage for the restored state fields
                var restoredState = {};
                // For each state field we have
                for (var s in Application.state) {
                    // read its value
                    var value = roamingSettings.values[s];
                    // if the field exists save tha vlue
                    if (value != undefined) {
                        restoredState[s] = JSON.parse(value);
                    }
                }

                // Clean up some fields that were restored as string but should be objects
                if (restoredState.timestamp) {
                    restoredState.timestamp = new Date(restoredState.timestamp);
                }

                // Only if the entire state is resotred do we commit it to Application.state
                for (var s in restoredState) {
                    Application.state[s] = restoredState[s];
                }
            } catch (e) {
                // Do nothing and just start from scratch is something went wrong
            }
        },

        WebServiceTools: WinJS.Namespace.define("Application.WebServiceTools", {

            requestData: function requestData(notdienst, loc) {
                return new WinJS.Promise(function (completed, error, progress) {
                    // put togethe the request URL
                    var request = windowsWebserviceUrl;
                    if (notdienst) {
                        request += "source=not";
                    } else {
                        request += "source=apo";
                    }
                    request += "&lat=" + loc.latitude + "&lng=" + loc.longitude;
                    // Construct a parser object
                    var parser = new DocumentParser(completed, error, notdienst).parseDocument;
                    // Put together options for the request
                    var xhrOptions = {
                        url: request,
                        // This ensures that we don't get cached results
                        headers: {
                            "If-Modified-Since": "Mon, 27 Mar 1972 00:00:00 GMT"
                        },
                    }
                    // Fire off the request with a timeout. Will call error in case a timeout occurs
                    WinJS.Promise.timeout(REQUEST_TIMEOUT, WinJS.xhr(xhrOptions).then(parser, error, progress));
                });
            }
        })
    });

    function DocumentParser(complete, error, notdienst) {

        this.parseDocument = function (result) {
            try {
                var document = new Windows.Data.Xml.Dom.XmlDocument();
                // Parse the text. This way we can use document.selectNodes()
                document.loadXml(result.responseText);
                // create a new array
                var list = [];
                // Get a list of all apotheken nodes
                var nodes = document.selectNodes("/result/apotheken/apotheke");
                // Get an iterator for the list
                var it = nodes.first();

                while (it.hasCurrent) {
                    // Get the current apotheken node
                    var apotheke = it.current;
                    // Get the list of attributes for the Apotheke
                    var it2 = apotheke.childNodes.first();

                    var attributeMap = {};
                    while (it2.hasCurrent) {
                        var attributeNode = it2.current;

                        attributeMap[attributeNode.localName] = attributeNode.innerText;
                        it2.moveNext();
                    }

                    var apotheke = new Apotheke(attributeMap["name"], attributeMap["strasse"], attributeMap["plz"],
                        attributeMap["ort"], attributeMap["telefon"], attributeMap["fax"], attributeMap["email"], notdienst,
                        attributeMap["distanz"], attributeMap["lat"], attributeMap["long"], attributeMap["startdatum"],
                        attributeMap["startzeit"], attributeMap["enddatum"], attributeMap["endzeit"]);

                    list.push(apotheke);

                    it.moveNext();
                }

                complete(list);
            } catch (e) 
            {
                // If anything goes wrong pass it on to the error handler
                error(e);
            }
        }
    };
    
})();