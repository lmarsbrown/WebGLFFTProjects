#version 300 es
precision highp float;
in vec2 v_position;

uniform int helix_size;
uniform int direction;
uniform ivec2 resolution;

uniform sampler2D input_tex;
uniform sampler2D roots;
out vec4 FragColor;

void main()
{
    int res = resolution.x;
    int ix = int(0.5*(v_position.x+1.0)*float(resolution.x));
    int iy = int(0.5*(v_position.y+1.0)*float(resolution.y));

    int i;
    if(direction == 0)
    {
        i = ix;
    }
    else
    {
        i = iy;
    }

    int helix_number = i/(helix_size*2);
    int helix_elem_ind = i%helix_size;
    int is_half = (i / helix_size)%2;
    

    int even_ind = helix_number*helix_size+helix_elem_ind;
    ivec2 even_ind_loc;
    if(direction == 0)
    {
        even_ind_loc = ivec2(even_ind,iy);
    }
    else
    {
        even_ind_loc = ivec2(ix,even_ind);
    }
    vec2 even_val = vec2(texelFetch(input_tex,even_ind_loc,0));

    int odd_ind = helix_number*helix_size+helix_elem_ind+res/2;
    ivec2 odd_ind_loc;
    if(direction == 0)
    {
        odd_ind_loc = ivec2(odd_ind,iy);
    }
    else
    {
        odd_ind_loc = ivec2(ix,odd_ind);
    }
    vec2 odd_val  = vec2(texelFetch(input_tex,odd_ind_loc,0));

    int root_ind = helix_elem_ind*res/(helix_size*2)+is_half*res/2;
    vec2 twist_val = vec2(texelFetch(roots,ivec2(root_ind,0),0));

    //Sqrt is sus
    FragColor = vec4(sqrt(0.5)*(even_val + vec2(
        odd_val.x*twist_val.x-odd_val.y*twist_val.y,
        odd_val.x*twist_val.y+odd_val.y*twist_val.x
    )),0.0,1.0);
}