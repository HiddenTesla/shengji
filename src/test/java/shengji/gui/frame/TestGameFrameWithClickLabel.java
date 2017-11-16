package shengji.gui.frame;

import org.apache.log4j.Logger;
import shengji.gui.CardImage;
import shengji.gui.GameFrame;
import shengji.gui.ImageLabel;
import shengji.logger.LogFactory;

import javax.swing.*;
import java.awt.*;
import java.awt.event.MouseEvent;
import java.awt.event.MouseListener;

public class TestGameFrameWithClickLabel extends GameFrame {
    private static Logger log = LogFactory.getLog(TestGameFrameWithClickLabel.class);

    protected ImageLabel clicker = new ImageLabel(this);

    private int count = 0;
    private int direction = 1;

    public TestGameFrameWithClickLabel() {
        clicker.setBounds(20, 20, 200, 200);
        clicker.setText("Click here to start");
        setButtonMouseListener();
    }

    protected void setButtonMouseListener() {
        clicker.addMouseListener(new MouseListener() {
            public void mouseClicked(MouseEvent e) {
                giveSouthOneMoreCard();
            }

            public void mousePressed(MouseEvent e) { }
            public void mouseReleased(MouseEvent e) { }
            public void mouseEntered(MouseEvent e) { }
            public void mouseExited(MouseEvent e) { }
        });
    }

    public void giveSouthOneMoreCard() {
        if (count < 5) {
            CardImage card = new CardImage(this, "cards/small_joker.png");
            south.addCard(card);
            south.display();
            count++;
        }
        else {
            direction = -1;
        }

        if (direction < 0) {
            south.popCard();
            south.display();
        }
    }

    public static void main(String[] args) {
        TestGameFrameWithClickLabel frame = new TestGameFrameWithClickLabel();

        frame.setVisible(true);
    }

    // Something to see if github can find
}
