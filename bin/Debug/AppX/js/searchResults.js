// For an introduction to the Search Contract template, see the following documentation:
// http://go.microsoft.com/fwlink/?LinkId=232512

// TODO: Add the following script tag to the start page's head to
// subscribe to search contract events.
//  
// <script src="/js/searchResults.js"></script>
//
// TODO: Edit the manifest to enable use as a search target.  The package 
// manifest could not be automatically updated.  Open the package manifest file
// and ensure that support for activation of searching is enabled.

(function () {
    "use strict";

    WinJS.Binding.optimizeBindingReferences = true;

    // Constants
    var searchPageURI = "/searchResults.html";

    var appModel = Windows.ApplicationModel;
    var appViewState = Windows.UI.ViewManagement.ApplicationViewState;
    var nav = WinJS.Navigation;
    var ui = WinJS.UI;
    var utils = WinJS.Utilities;    
    var _lastSearch = "";

    var listView;
    var mapDummy;

    ui.Pages.define(searchPageURI, {
        _filters: [],        

        // This function is called whenever a user navigates to this page. It
        // populates the page elements with the app's data.
        ready: function (element, options) {
            // Process all data-win-res attributes
            WinJS.Resources.processAll();

            listView = element.querySelector(".resultslist").winControl;
            listView.itemTemplate = element.querySelector(".itemtemplate");
            listView.oniteminvoked = _itemInvoked;            

            // Register handler for when the user picks a search suggestion
            Windows.ApplicationModel.Search.SearchPane.getForCurrentView().onresultsuggestionchosen = searchSuggestionChosen;

            Microsoft.Maps.loadModule('Microsoft.Maps.Search');
            Microsoft.Maps.loadModule('Microsoft.Maps.Map', { callback: initMap, culture: "de-de", homeRegion: "DE" });

            function initMap() {
                // Initialize constatn after the module is loaded
                Application.BOUNDS_GERMANY = new Microsoft.Maps.LocationRect.fromCorners(new Microsoft.Maps.Location(47, 6), new Microsoft.Maps.Location(55, 15));

                var mapOptions =
                {
                    credentials: "Aq-XamJc2dELbm2ZaiAfYZ3Y-9iy5CMhl9CS27VZDmcZ6Y2DeMxMSLhhb2GQEo_1"
                };

                // Create a Map instance
                mapDummy = new Microsoft.Maps.Map(document.getElementById("mapDummy"), mapOptions);
                // Create the seach manager
                Application.searchManager = new Microsoft.Maps.Search.SearchManager(mapDummy);

                _handleQuery(element, options);
                listView.element.focus();
            }
        },

        // This function updates the page layout in response to viewState changes.
        updateLayout: function (element, viewState, lastViewState) {
            /// <param name="element" domElement="true" />

            var listView = element.querySelector(".resultslist").winControl;
            if (lastViewState !== viewState) {
                if (lastViewState === appViewState.snapped || viewState === appViewState.snapped) {
                    var handler = function (e) {
                        listView.removeEventListener("contentanimating", handler, false);
                        e.preventDefault();
                    }
                    listView.addEventListener("contentanimating", handler, false);
                    var firstVisible = listView.indexOfFirstVisible;
                    _initializeLayout(listView, viewState);
                    if (firstVisible >= 0 && listView.itemDataSource.list.length > 0) {
                        listView.indexOfFirstVisible = firstVisible;
                    }
                }
            }
        },
        unload: function () {            
            // Unregister context sensitive event handlers
            Windows.ApplicationModel.Search.SearchPane.getForCurrentView().onresultsuggestionchosen = null;

            if (mapDummy) {
                Application.searchManager = null;
                
                // Clean up the map, otherwise we get an exception when navigating back here
                mapDummy.dispose();
                mapDummy = null;
            }
        }
    });

    // This function updates the ListView with new layouts
    function _initializeLayout(listView, viewState) {
        /// <param name="listView" value="WinJS.UI.ListView.prototype" />


        if (viewState === appViewState.snapped) {
            listView.layout = new ui.ListLayout();
            document.querySelector(".titlearea .pagetitle").textContent = '“' + _lastSearch + '”';
            document.querySelector(".titlearea .pagesubtitle").textContent = "";
        } else {
            listView.layout = new ui.GridLayout();

            // TODO: Change "App Name" to the name of your app.
            document.querySelector(".titlearea .pagetitle").textContent = "Apotheken der ABDA";
            document.querySelector(".titlearea .pagesubtitle").textContent = "Ergebnisse für “" + _lastSearch + '”';
        }
    };

    function _itemInvoked (args) {
        args.detail.itemPromise.done(function itemInvoked(item) {
            goBackWithLocation(item.data.location);            
        });
    };    

    // This function executes each step required to perform a search.
    function _handleQuery (element, args) {
        var originalResults;
        _lastSearch = args.queryText;
        
        _initializeLayout(element.querySelector(".resultslist").winControl, Windows.UI.ViewManagement.ApplicationView.value);
        originalResults = _searchData(args.queryText);
    };

    function _searchCallback (geocodeResult, userData) {
        document.getElementById("searchProgress").style.display = "none";
        document.querySelector('.errormessage').style.display = "none";
        var list = new WinJS.Binding.List(geocodeResult.results);
        listView.itemDataSource = list.dataSource;

        if (geocodeResult.results.length === 0) {
            document.querySelector('.noresultsmessage').style.display = "-ms-inline-grid";
        } else {
            document.querySelector('.noresultsmessage').style.display = "none";
        }
    };

    function _searchErrorCallback() {
        document.getElementById("searchProgress").style.display = "none";
        listView.itemDataSource = null;

        document.querySelector('.errormessage').style.display = "-ms-inline-grid";
        document.querySelector('.noresultsmessage').style.display = "none";
    };

    // This function populates a WinJS.Binding.List with search results for the
    // provided query.
    function _searchData(queryText) {
        var originalResults;

        var geocodeRequest = {
            // Make sure it does not say "Deutschland" twice in the search term
            where: queryText.replace("Deutschland", "") + " Deutschland",
            count: 5,
            callback: _searchCallback,
            errorCallback: _searchErrorCallback,
        };
        Application.searchManager.geocode(geocodeRequest);
    };


    function searchSuggestionChosen(eventObject) {
        // Extract the corrdinates form the tag
        var splitTag = eventObject.tag.split(",");
        var location = new Microsoft.Maps.Location(splitTag[0], splitTag[1]);
        // Update the data and map
        goBackWithLocation(location);
    };

    function goBackWithLocation(location)
    {
        var previousIndex = nav.history.backStack.length - 1;
        // Sanity Check. Should not happen
        if (previousIndex < 0) {
            return;
        }
        nav.history.backStack[previousIndex].state = { location: location};
        nav.back();
    }

    appModel.Search.SearchPane.getForCurrentView().onquerysubmitted = function (args) {
        if (nav.location === searchPageURI) {
            _handleQuery(document, args);
        } else {
            nav.navigate(searchPageURI, args);
        }
    };

})();
