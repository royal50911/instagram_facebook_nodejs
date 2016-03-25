(function() {
$(document).ajaxStart(function() {
    console.log("Start");
    $(".modal").addClass("loading");
  });

	$.getJSON('/igselfphotosasync')
		.done(function(data) {
			//console.log(data);
			console.log('printing images');
			var test = data.users.map(function(item) {
				console.log("item:");
				console.log(item);
				return item.images.low_resolution.url;
			});
			var photonum = $('<h2>');
			photonum.append(data.photocount);
			photonum.appendTo('#imglist');
			count = 0;
			while(count < test.length) {
				var img = $('<img>');
				img.attr('src', test[count]);
				img.appendTo('#imglist');
				count++;
			}
		});

	
})();