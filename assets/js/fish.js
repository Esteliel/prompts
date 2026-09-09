// Adapted from Better_Alist/fish.js: original fish shapes and spring-water simulation.
// Integration uses native DOM APIs; no jQuery or Alist-specific scripts required.
(function () {
'use strict';
var RENDERER = {
	POINT_INTERVAL : 5,
	FISH_COUNT : 3,
	MAX_INTERVAL_COUNT : 50,
	INIT_HEIGHT_RATE : 0.5,
	THRESHOLD : 50,

	init : function(){
		this.setParameters();
		this.reconstructMethods();
		this.setup();
		this.bindEvent();
		this.updateAnimation();
	},
	setParameters : function(){
        this.container = document.getElementById('jsi-flying-fish-container');
        this.canvas = document.createElement('canvas');
        this.container.appendChild(this.canvas);
        this.context = this.canvas.getContext('2d');
        this.points = [];
        this.fishes = [];
        this.motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
        this.frameId = null;
        this.lastFrame = null;
    },
	createSurfacePoints : function(){
		var count = Math.max(2, Math.round(this.width / this.POINT_INTERVAL));
		this.pointInterval = this.width / (count - 1);
		this.points.push(new SURFACE_POINT(this, 0));

		for(var i = 1; i < count; i++){
			var point = new SURFACE_POINT(this, i * this.pointInterval),
				previous = this.points[i - 1];

			point.setPreviousPoint(previous);
			previous.setNextPoint(point);
			this.points.push(point);
		}
	},
	reconstructMethods : function(){
        this.moveEpicenter = this.moveEpicenter.bind(this);
        this.render = this.render.bind(this);
        this.updateAnimation = this.updateAnimation.bind(this);
    },
    setup : function(){
        this.points.length = 0;
        this.fishes.length = 0;
        this.intervalCount = this.MAX_INTERVAL_COUNT;
        this.width = Math.max(1, this.container.clientWidth);
        this.height = Math.max(1, this.container.clientHeight);
        this.fishCount = this.FISH_COUNT * this.width / 500 * this.height / 500;
        var ratio = Math.min(window.devicePixelRatio || 1, 2);
        this.canvas.width = Math.round(this.width * ratio);
        this.canvas.height = Math.round(this.height * ratio);
        this.context.setTransform(ratio, 0, 0, ratio, 0, 0);
        this.color = getComputedStyle(this.container).getPropertyValue('--fish-color').trim() || 'hsl(0, 0%, 95%)';
        this.reverse = false;
        this.axis = null;
        this.fishes.push(new FISH(this));
        this.createSurfacePoints();
    },
    bindEvent : function(){
        var renderer = this;
        this.resizeObserver = new ResizeObserver(function(){
            renderer.setup();
            renderer.updateAnimation();
        });
        this.resizeObserver.observe(this.container);
        // Observe pointer motion without placing an interactive overlay above links.
        document.addEventListener('pointermove', this.moveEpicenter, {passive: true});
        document.addEventListener('visibilitychange', this.updateAnimation);
        this.motionQuery.addEventListener('change', this.updateAnimation);
    },
    getAxis : function(event){
        var rect = this.container.getBoundingClientRect();
        return {x: event.clientX - rect.left, y: event.clientY - rect.top};
    },
    updateAnimation : function(){
        if(this.frameId !== null){
            cancelAnimationFrame(this.frameId);
            this.frameId = null;
        }
        this.lastFrame = null;
        if(document.hidden){ return; }
        if(this.motionQuery.matches){
            this.draw();
        }else{
            this.frameId = requestAnimationFrame(this.render);
        }
    },
	startEpicenter : function(event){
		this.axis = this.getAxis(event);
	},
	moveEpicenter : function(event){
		if(this.motionQuery.matches || document.hidden){ return; }
        var axis = this.getAxis(event);
        if(axis.y < 0 || axis.y > this.height){ this.axis = null; return; }

		if(!this.axis){
			this.axis = axis;
		}
		this.generateEpicenter(axis.x, axis.y, axis.y - this.axis.y);
		this.axis = axis;
	},
	generateEpicenter : function(x, y, velocity){
		if(y < this.height / 2 - this.THRESHOLD || y > this.height / 2 + this.THRESHOLD){
			return;
		}
		var index = Math.round(x / this.pointInterval);

		if(index < 0 || index >= this.points.length){
			return;
		}
		this.points[index].interfere(y, velocity);
	},
	reverseVertical : function(){
		this.reverse = !this.reverse;

		for(var i = 0, count = this.fishes.length; i < count; i++){
			this.fishes[i].reverseVertical();
		}
	},
	controlStatus : function(){
		for(var i = 0, count = this.points.length; i < count; i++){
			this.points[i].updateSelf();
		}
		for(var i = 0, count = this.points.length; i < count; i++){
			this.points[i].updateNeighbors();
		}
		if(this.fishes.length < this.fishCount){
			if(--this.intervalCount == 0){
				this.intervalCount = this.MAX_INTERVAL_COUNT;
				this.fishes.push(new FISH(this));
			}
		}
	},
	render : function(timestamp){
        this.frameId = requestAnimationFrame(this.render);
        // Keep the original 60 Hz physics speed on high-refresh displays.
        if(this.lastFrame !== null && timestamp - this.lastFrame < 1000 / 60){ return; }
        this.lastFrame = timestamp - (this.lastFrame === null ? 0 : (timestamp - this.lastFrame) % (1000 / 60));
        this.controlStatus();
        this.draw();
    },
    draw : function(){
		this.context.clearRect(0, 0, this.width, this.height);
		this.context.fillStyle = this.color;

		for(var i = 0, count = this.fishes.length; i < count; i++){
			this.fishes[i].render(this.context);
		}
		this.context.save();
		this.context.globalCompositeOperation = 'xor';
		this.context.beginPath();
		this.context.moveTo(0, this.reverse ? 0 : this.height);

		for(var i = 0, count = this.points.length; i < count; i++){
			this.points[i].render(this.context);
		}
		this.context.lineTo(this.width, this.reverse ? 0 : this.height);
		this.context.closePath();
		this.context.fill();
		this.context.restore();
	}
};
var SURFACE_POINT = function(renderer, x){
	this.renderer = renderer;
	this.x = x;
	this.init();
};
SURFACE_POINT.prototype = {
	SPRING_CONSTANT : 0.03,
	SPRING_FRICTION : 0.9,
	WAVE_SPREAD : 0.3,
	ACCELARATION_RATE : 0.01,

	init : function(){
		this.initHeight = this.renderer.height * this.renderer.INIT_HEIGHT_RATE;
		this.height = this.initHeight;
		this.fy = 0;
		this.force = {previous : 0, next : 0};
	},
	setPreviousPoint : function(previous){
		this.previous = previous;
	},
	setNextPoint : function(next){
		this.next = next;
	},
	interfere : function(y, velocity){
		this.fy = this.renderer.height * this.ACCELARATION_RATE * ((this.renderer.height - this.height - y) >= 0 ? -1 : 1) * Math.abs(velocity);
	},
	updateSelf : function(){
		this.fy += this.SPRING_CONSTANT * (this.initHeight - this.height);
		this.fy *= this.SPRING_FRICTION;
		this.height += this.fy;
	},
	updateNeighbors : function(){
		if(this.previous){
			this.force.previous = this.WAVE_SPREAD * (this.height - this.previous.height);
		}
		if(this.next){
			this.force.next = this.WAVE_SPREAD * (this.height - this.next.height);
		}
	},
	render : function(context){
		if(this.previous){
			this.previous.height += this.force.previous;
			this.previous.fy += this.force.previous;
		}
		if(this.next){
			this.next.height += this.force.next;
			this.next.fy += this.force.next;
		}
		context.lineTo(this.x, this.renderer.height - this.height);
	}
};
var FISH = function(renderer){
	this.renderer = renderer;
	this.init();
};
FISH.prototype = {
	GRAVITY : 0.4,

	init : function(){
		this.direction = Math.random() < 0.5;
		this.x = this.direction ? (this.renderer.width + this.renderer.THRESHOLD) : -this.renderer.THRESHOLD;
		this.previousY = this.y;
		this.vx = this.getRandomValue(4, 10) * (this.direction ? -1 : 1);

		if(this.renderer.reverse){
			this.y = this.getRandomValue(this.renderer.height * 1 / 10, this.renderer.height * 4 / 10);
			this.vy = this.getRandomValue(2, 5);
			this.ay = this.getRandomValue(0.05, 0.2);
		}else{
			this.y = this.getRandomValue(this.renderer.height * 6 / 10, this.renderer.height * 9 / 10);
			this.vy = this.getRandomValue(-5, -2);
			this.ay = this.getRandomValue(-0.2, -0.05);
		}
		this.isOut = false;
		this.theta = 0;
		this.phi = 0;
	},
	getRandomValue : function(min, max){
		return min + (max - min) * Math.random();
	},
	reverseVertical : function(){
		this.isOut = !this.isOut;
		this.ay *= -1;
	},
	controlStatus : function(context){
		this.previousY = this.y;
		this.x += this.vx;
		this.y += this.vy;
		this.vy += this.ay;

		if(this.renderer.reverse){
			if(this.y > this.renderer.height * this.renderer.INIT_HEIGHT_RATE){
				this.vy -= this.GRAVITY;
				this.isOut = true;
			}else{
				if(this.isOut){
					this.ay = this.getRandomValue(0.05, 0.2);
				}
				this.isOut = false;
			}
		}else{
			if(this.y < this.renderer.height * this.renderer.INIT_HEIGHT_RATE){
				this.vy += this.GRAVITY;
				this.isOut = true;
			}else{
				if(this.isOut){
					this.ay = this.getRandomValue(-0.2, -0.05);
				}
				this.isOut = false;
			}
		}
		if(!this.isOut){
			this.theta += Math.PI / 20;
			this.theta %= Math.PI * 2;
			this.phi += Math.PI / 30;
			this.phi %= Math.PI * 2;
		}
		this.renderer.generateEpicenter(this.x + (this.direction ? -1 : 1) * this.renderer.THRESHOLD, this.y, this.y - this.previousY);

		if(this.vx > 0 && this.x > this.renderer.width + this.renderer.THRESHOLD || this.vx < 0 && this.x < -this.renderer.THRESHOLD){
			this.init();
		}
	},
	render : function(context){
		context.save();
		context.translate(this.x, this.y);
		context.rotate(Math.PI + Math.atan2(this.vy, this.vx));
		context.scale(1, this.direction ? 1 : -1);
		context.beginPath();
		context.moveTo(-30, 0);
		context.bezierCurveTo(-20, 15, 15, 10, 40, 0);
		context.bezierCurveTo(15, -10, -20, -15, -30, 0);
		context.fill();

		context.save();
		context.translate(40, 0);
		context.scale(0.9 + 0.2 * Math.sin(this.theta), 1);
		context.beginPath();
		context.moveTo(0, 0);
		context.quadraticCurveTo(5, 10, 20, 8);
		context.quadraticCurveTo(12, 5, 10, 0);
		context.quadraticCurveTo(12, -5, 20, -8);
		context.quadraticCurveTo(5, -10, 0, 0);
		context.fill();
		context.restore();

		context.save();
		context.translate(-3, 0);
		context.rotate((Math.PI / 3 + Math.PI / 10 * Math.sin(this.phi)) * (this.renderer.reverse ? -1 : 1));

		context.beginPath();

		if(this.renderer.reverse){
			context.moveTo(5, 0);
			context.bezierCurveTo(10, 10, 10, 30, 0, 40);
			context.bezierCurveTo(-12, 25, -8, 10, 0, 0);
		}else{
			context.moveTo(-5, 0);
			context.bezierCurveTo(-10, -10, -10, -30, 0, -40);
			context.bezierCurveTo(12, -25, 8, -10, 0, 0);
		}
		context.closePath();
		context.fill();
		context.restore();
		context.restore();
		if(!this.renderer.motionQuery.matches){ this.controlStatus(context); }
	}
};
function init(){
    var container = document.getElementById('jsi-flying-fish-container');
    if(!container || container.querySelector('canvas')){ return; }
    RENDERER.init();
}
if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init, {once: true});
}else{
    init();
}
})();
